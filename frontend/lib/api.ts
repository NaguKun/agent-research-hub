const API_BASE = 'http://localhost:8000/api';

export const api = {
  sessions: {
    list: () => fetch(`${API_BASE}/sessions`).then(r => r.json()),
    create: (title: string) => fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then(r => r.json()),
    get: (id: string) => fetch(`${API_BASE}/sessions/${id}`).then(r => r.json()),
    delete: (id: string) => fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' }),
    getMessages: (id: string) => fetch(`${API_BASE}/sessions/${id}/messages`).then(r => r.json()),
    sendMessage: (id: string, content: string, mode: string = 'mock') => fetch(`${API_BASE}/sessions/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode }),
    }).then(r => r.json()),
    answerQuestion: (id: string, prompt_id: string, answer: string) => fetch(`${API_BASE}/sessions/${id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_id, answer }),
    }).then(r => r.json()),
    getArtifacts: (id: string) => fetch(`${API_BASE}/sessions/${id}/artifacts`).then(r => r.json()),
    getArtifactContent: (sessionId: string, artifactId: string) => fetch(`${API_BASE}/sessions/${sessionId}/artifacts/${artifactId}`).then(r => r.json()).then(data => data.content || ''),
  },
  getStreamUrl: (id: string) => `${API_BASE}/sessions/${id}/stream`,
};
