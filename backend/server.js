const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const GeminiClient = require('./services/geminiClient');
const ANALYSIS_SCHEMA = require('./constants/analysisSchema');
const LEARNING_SCHEMA = require('./constants/learningSchema');
const RECOMMENDATIONS_DB = require('./data/recommendations');
const { cleanupFile } = require('./utils/fileUtils');
const VertexCourseSearch = require('./services/vertexSearch');

dotenv.config();

// --- Config & Constants ---

const app = express();
const PORT = process.env.PORT || 4000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-09-2025';
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. The /api/analyze endpoint will fail until you add it to your .env file.');
}

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const mapStaticRecommendationsToLearning = () => ({
  courses: (RECOMMENDATIONS_DB.certifications || []).map((c) => ({
    title: c.name,
    provider: c.provider || 'Static Catalog',
    link: c.link,
    cost: c.cost,
    duration: c.length,
    level: ''
  })),
  opportunities: (RECOMMENDATIONS_DB.opportunities || []).map((o) => ({
    name: o.name,
    description: o.description,
    link: o.link,
    difficulty: o.difficulty
  }))
});

const logError = (context, error) => {
  const details = error?.response?.data || error.message || error;
  console.error(`[${context}] error:`, details);
};

const ALLOWED_DOMAINS = [
  'coursera.org',
  'udemy.com',
  'grow.google',
  'google.com',
  'skillbuilder.aws',
  'aws.amazon.com',
  'edx.org',
  'linkedin.com',
  'kaggle.com',
  'mlh.io',
  'hackthebox.com'
];

const isAllowedDomain = (url) => {
  try {
    const host = new URL(url).host;
    return ALLOWED_DOMAINS.some((d) => host.endsWith(d));
  } catch {
    return false;
  }
};

const chooseLink = (candidateLink, sources = []) => {
  if (candidateLink && isAllowedDomain(candidateLink)) return candidateLink;
  const fromSources = sources.find((s) => s?.uri && isAllowedDomain(s.uri));
  return fromSources ? fromSources.uri : null;
};

// --- Middleware ---

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const geminiClient = new GeminiClient({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_MODEL,
  schema: ANALYSIS_SCHEMA,
  learningSchema: LEARNING_SCHEMA
});
const vertexSearch = new VertexCourseSearch({
  apiKey: VERTEX_API_KEY,
  model: process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite',
  schema: LEARNING_SCHEMA
});

const upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, UPLOAD_DIR);
    },
    filename: function (_req, file, cb) {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${unique}-${file.originalname}`);
    }
  })
});

// --- Routes ---

app.post('/api/analyze', async (req, res) => {
  try {
    const { resumeText, careerGoal } = req.body || {};

    if (!resumeText || !careerGoal) {
      return res.status(400).json({ error: 'resumeText and careerGoal are required.' });
    }

    console.log(`[analyze] careerGoal="${careerGoal}" textLength=${resumeText.length}`);
    const analysisWithMetadata = await geminiClient.generateStructuredAnalysis(resumeText, careerGoal);
    console.log(`[analyze] success careerGoal="${careerGoal}" score=${analysisWithMetadata.resumeScore}`);
    return res.json(analysisWithMetadata);
  } catch (error) {
    logError('analyze', error);
    return res.status(500).json({
      error: 'Failed to analyze resume with Gemini.',
      details: error?.response?.data || error.message
    });
  }
});

app.post('/api/upload-resume', upload.single('file'), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume file uploaded.' });
    }

    const { careerGoal } = req.body || {};
    filePath = req.file.path;

    console.log(`[upload-resume] file=${req.file.originalname} size=${req.file.size} careerGoal="${careerGoal || ''}"`);
    const text = await geminiClient.extractTextFromFile(req.file);

    let analysis = null;
    if (careerGoal) {
      console.log(`[upload-resume] running analysis for careerGoal="${careerGoal}"`);
      analysis = await geminiClient.generateStructuredAnalysis(text, careerGoal);
    }

    console.log(`[upload-resume] success file=${req.file.originalname} chars=${text.length}`);
    return res.json({
      extractedText: text,
      characterCount: text.length,
      analysis
    });
  } catch (error) {
    logError('upload-resume', error);
    return res.status(500).json({
      error: "Failed to process uploaded resume.",
      details: error?.response?.data || error.message
    });
  } finally {
    cleanupFile(filePath);
  }
});

app.post('/api/courses/external', async (req, res) => {
  try {
    const { role, skills } = req.body || {};

    if (!role) {
      return res.status(400).json({ error: 'role is required.' });
    }

    const skillsText = Array.isArray(skills) ? skills.join(', ') : (skills || '');

    console.log(`[courses] role="${role}" skills="${skillsText}"`);
    let courses = [];
    let sources = [];
    let usedVertex = false;

    let vertexResult = null;

    if (vertexSearch.isEnabled()) {
      try {
        vertexResult = await vertexSearch.searchCourses({ role, skills: Array.isArray(skills) ? skills : [skillsText] });
        courses = vertexResult.courses || [];
        sources = vertexResult.sources || [];
        usedVertex = true;
        console.log(`[courses] vertex results=${courses.length}`);
      } catch (err) {
        logError('courses-vertex', err);
      }
    }

    // If Vertex failed or returned nothing, fall back to Gemini + static sanitizer.
    if (!courses.length) {
      const discovery = await geminiClient.discoverLearningResources(role, skillsText);
      const structured = await geminiClient.structureLearningResources(discovery.text, discovery.sources);

      const sanitizedCourses = (structured.courses || [])
        .map((c) => ({
          ...c,
          link: chooseLink(c.link, discovery.sources)
        }))
        .filter((c) => !!c.link);

      courses = sanitizedCourses.length ? sanitizedCourses : mapStaticRecommendationsToLearning().courses;
      sources = discovery.sources || [];
    }

    const opportunities = usedVertex ? (vertexResult?.opportunities || []) : mapStaticRecommendationsToLearning().opportunities;

    console.log(`[courses] success role="${role}" courses=${courses.length} opportunities=${opportunities.length} usedVertex=${usedVertex}`);
    return res.json({
      role,
      skills: skillsText,
      courses,
      opportunities,
      sources,
      usedVertex,
      fallback: !usedVertex && !sources.length
    });
  } catch (error) {
    logError('courses', error);
    const fallback = mapStaticRecommendationsToLearning();
    console.log(`[courses] fallback served courses=${fallback.courses.length} opportunities=${fallback.opportunities.length}`);
    return res.status(200).json({
      role: req.body?.role,
      skills: Array.isArray(req.body?.skills) ? req.body.skills.join(', ') : (req.body?.skills || ''),
      courses: fallback.courses,
      opportunities: fallback.opportunities,
      sources: [],
      fallback: true,
      message: 'Live lookup failed; returning static catalog.'
    });
  }
});

app.get('/api/recommendations/details', (req, res) => {
  const { type } = req.query;

  if (!type || !RECOMMENDATIONS_DB[type]) {
    return res.status(400).json({ error: "Invalid type parameter." });
  }

  res.json({
    type,
    items: RECOMMENDATIONS_DB[type]
  });
});

app.get('/', (_req, res) => {
  res.send('CareerLift AI backend is running.');
});

// ======================== COURSE MANAGEMENT ========================

// In-memory database
let courses = [];
let nextCourseId = 1;

// CREATE COURSE
app.post("/api/courses", (req, res) => {
    const { title, category, level, description, url, createdBy } = req.body;

    if (!title || !category || !level) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const newCourse = {
        id: nextCourseId++,
        title,
        category,
        level,
        description,
        url,
        createdBy,
        createdAt: new Date().toISOString()
    };

    courses.push(newCourse);
    res.json({ message: "Course created successfully", course: newCourse });
});

// GET ALL COURSES
app.get("/api/courses", (req, res) => {
    res.json(courses);
});

// UPDATE COURSE
app.put("/api/courses/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const course = courses.find((c) => c.id === id);

    if (!course) {
        return res.status(404).json({ error: "Course not found" });
    }

    const { title, category, level, description, url } = req.body;

    if (title) course.title = title;
    if (category) course.category = category;
    if (level) course.level = level;
    if (description) course.description = description;
    if (url) course.url = url;

    res.json({ message: "Course updated successfully", course });
});

// DELETE COURSE
app.delete("/api/courses/:id", (req, res) => {
    const id = parseInt(req.params.id);

    const exists = courses.some((c) => c.id === id);
    if (!exists) {
        return res.status(404).json({ error: "Course not found" });
    }

    courses = courses.filter((c) => c.id !== id);
    res.json({ message: "Course deleted successfully", id });
});


app.listen(PORT, () => {
  console.log(`CareerLift AI backend listening on port ${PORT}`);
});
