const API_BASE = 'http://localhost:8000/api';

// Map raw filenames to friendly, human-readable titles
function _friendlyTitle(filename: string, agentName: string): string {
  const nameMap: Record<string, string> = {
    'final_report.md': '📋 Final Research Brief',
    'data_analysis.md': '📊 Data Analysis Summary',
  };
  if (nameMap[filename]) return nameMap[filename];
  
  // Handle research_notes_N.md pattern
  const notesMatch = filename.match(/research_notes_(\d+)\.md/);
  if (notesMatch) return `🔍 Research Notes #${notesMatch[1]}`;

  // Fallback: humanize filename
  const name = filename.replace(/\.md$/, '').replace(/[_-]/g, ' ');
  const agentLabel = agentName ? ` (${agentName})` : '';
  return name.charAt(0).toUpperCase() + name.slice(1) + agentLabel;
}

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
    getMessages: (id: string) => fetch(`${API_BASE}/sessions/${id}/messages`).then(r => r.json()).then(msgs => msgs.map((m: any) => ({ ...m, id: m.message_id }))),
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
    getArtifacts: (id: string) => fetch(`${API_BASE}/sessions/${id}/artifacts`).then(r => r.json()).then((arts: any[]) => arts.map((a: any) => ({
      artifact_id: a.artifact_id,
      title: _friendlyTitle(a.filename, a.agent_name),
      type: a.content_type || 'text/markdown',
      filename: a.filename,
      agent_name: a.agent_name,
    }))),
    getArtifactContent: (sessionId: string, artifactId: string) => fetch(`${API_BASE}/sessions/${sessionId}/artifacts/${artifactId}`).then(r => r.json()).then(data => data.content || ''),
    getTrace: (sessionId: string) => fetch(`${API_BASE}/sessions/${sessionId}/trace`).then(r => r.json()),
  },
  getStreamUrl: (id: string) => `${API_BASE}/sessions/${id}/stream`,
};
