const axios = require('axios');

class VertexCourseSearch {
  constructor({ projectId, location, dataStoreId, apiKey }) {
    this.projectId = projectId;
    this.location = location;
    this.dataStoreId = dataStoreId;
    this.apiKey = apiKey;
    this.enabled = !!(projectId && location && dataStoreId && apiKey);
  }

  isEnabled() {
    return this.enabled;
  }

  async searchCourses({ query, skills = [], pageSize = 6 }) {
    if (!this.enabled) {
      throw new Error('Vertex course search is not configured.');
    }

    const filterSkills = (skills || [])
      .map((s) => s?.trim())
      .filter(Boolean)
      .map((s) => `"${s.replace(/"/g, '')}"`);

    const filter =
      filterSkills.length > 0
        ? `type="course" AND skills:(${filterSkills.join(' OR ')})`
        : `type="course"`;

    const servingConfig = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${this.dataStoreId}/servingConfigs/default_search`;
    const url = `https://discoveryengine.googleapis.com/v1beta/${servingConfig}:search?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      query,
      pageSize,
      filter
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    const results = response.data?.results || [];

    return results
      .map((r) => {
        const doc = r.document?.derivedStructData || r.document?.structData || {};
        return {
          title: doc.title || r.document?.name || 'Course',
          provider: doc.provider || doc.source || '',
          link: doc.url || doc.link || '',
          cost: doc.cost || '',
          duration: doc.duration || '',
          level: doc.level || '',
          description: doc.description || ''
        };
      })
      .filter((c) => !!c.link);
  }
}

module.exports = VertexCourseSearch;
