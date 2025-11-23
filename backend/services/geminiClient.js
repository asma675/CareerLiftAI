const axios = require('axios');
const fs = require('fs');

class GeminiClient {
  constructor({ apiKey, model, schema, learningSchema }) {
    this.apiKey = apiKey;
    this.model = model;
    this.schema = schema;
    this.learningSchema = learningSchema;
  }

  get apiUrl() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  ensureConfigured() {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }
  }

  parseGroundingSources(result) {
    const groundingAttributions = result?.candidates?.[0]?.groundingMetadata?.groundingAttributions;
    if (!groundingAttributions) return [];

    return groundingAttributions
      .map((attr) => ({
        uri: attr.web?.uri,
        title: attr.web?.title
      }))
      .filter((source) => source.uri && source.title);
  }

  async generateStructuredAnalysis(resumeText, careerGoal) {
    if (!resumeText || !careerGoal) {
      throw new Error('resumeText and careerGoal are required for analysis.');
    }

    this.ensureConfigured();

    const systemPrompt = `You are a world-class AI Career Coach named CareerLift AI. Your task is to analyze a student's resume against their specified career goal. You must generate a score (out of 100), identify 3 crucial missing skills, and suggest 3 real-world opportunities and 3 certifications, all based on current industry standards and the user's career goal. Respond ONLY with a valid JSON object matching the provided schema.`;

    const truncatedResume = resumeText.substring(0, 5000);
    const userQuery = `Analyze the following resume content for the career goal: "${careerGoal}". Resume content: "${truncatedResume}".`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.schema,
      }
    };

    const response = await axios.post(this.apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const result = response.data;
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini response was empty or malformed.');
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(text);
    } catch (_err) {
      throw new Error('Failed to parse Gemini JSON response.');
    }

    return {
      ...analysisResult,
      timestamp: new Date().toISOString(),
      careerGoal,
      sources: this.parseGroundingSources(result)
    };
  }

  async extractTextFromFile(file) {
    if (!file) {
      throw new Error('No resume file uploaded.');
    }

    this.ensureConfigured();

    const fileBuffer = fs.readFileSync(file.path);
    const base64Data = fileBuffer.toString("base64");

    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: file.mimetype,
                data: base64Data
              }
            }
          ]
        }
      ]
    };

    const response = await axios.post(this.apiUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Failed to extract text from resume.');
    }

    return text;
  }

  async discoverLearningResources(role, skillsText = '') {
    if (!role) {
      throw new Error('role is required to search for courses/opportunities.');
    }

    this.ensureConfigured();

    const prompt = `Find current, reputable courses/certifications (Coursera, Udemy, Google/Grow with Google, AWS Training, etc.) and hands-on opportunities (hackathons, competitions, open-source programs, labs) for someone targeting the role "${role}". Prioritize the following skills or gaps: ${skillsText || 'general role requirements'}. Return a concise bullet list with title/provider/cost/duration/link for courses and name/description/link/difficulty for opportunities.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }]
    };

    const response = await axios.post(this.apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const result = response.data;
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini discovery response was empty or malformed.');
    }

    return {
      text,
      sources: this.parseGroundingSources(result)
    };
  }

  async structureLearningResources(discoveryText, discoverySources = []) {
    if (!discoveryText) {
      throw new Error('discoveryText is required to structure learning resources.');
    }
    if (!this.learningSchema) {
      throw new Error('learningSchema is not configured.');
    }

    this.ensureConfigured();

    const prompt = `You will receive a bullet list of courses and opportunities gathered from the web plus a list of source URLs. Convert it into a strict JSON object with two arrays: "courses" and "opportunities". Each course item must include title, provider, link (real URL), and optionally cost, duration, level. Each opportunity item must include name, link (real URL), and optionally description, difficulty. Prefer links provided in the source list; otherwise use the URL mentioned in the bullet text. Do not invent items; only structure what is provided. If a field is missing, omit it rather than guessing.`;

    const payload = {
      contents: [{ parts: [{ text: `${prompt}\n\nSources:\n${JSON.stringify(discoverySources)}\n\nContent:\n${discoveryText}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.learningSchema
      }
    };

    const response = await axios.post(this.apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const result = response.data;
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini structuring response was empty or malformed.');
    }

    try {
      return JSON.parse(text);
    } catch (_err) {
      throw new Error('Failed to parse structured learning resources JSON.');
    }
  }
}

module.exports = GeminiClient;
