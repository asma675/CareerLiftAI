const axios = require('axios');

class VertexCourseSearch {
  constructor({ apiKey, model, schema }) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-2.5-flash-lite';
    this.schema = schema;
    this.enabled = !!(apiKey && this.schema);
  }

  isEnabled() {
    return this.enabled;
  }

  async searchCourses({ role, skills = [] }) {
    if (!this.enabled) {
      throw new Error('Vertex course search is not configured.');
    }

    const skillsList = (skills || [])
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(', ');

    const prompt = `Find current, real courses and certifications for the role "${role}". Prioritize reputable providers (Coursera, Udemy, Google/Grow with Google, AWS, edX, LinkedIn Learning). Use only real URLs from those providers. Include 5-8 items. Return JSON only. Skills to emphasize: ${skillsList || 'general role requirements'}.`;

    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.schema
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Vertex response was empty or malformed.');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Failed to parse Vertex JSON response.');
    }

    return {
      courses: parsed.courses || [],
      opportunities: parsed.opportunities || []
    };
  }
}

module.exports = VertexCourseSearch;
