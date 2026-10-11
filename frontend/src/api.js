// API service for Nexus Esports Platform
const API_BASE = '/api'

async function request(path, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
    ...options,
  }

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body)
  }

  const response = await fetch(`${API_BASE}${path}`, config)
  let data
  try {
    data = await response.json()
  } catch (_e) {
    data = null
  }

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed (${response.status})`
    throw new Error(errorMsg)
  }

  return data
}

export const api = {
  // Auth
  getMe: () => request('/auth/me'),
  login: (username, password) => request('/auth/login', {
    method: 'POST',
    body: { username, password },
  }),
  register: (username, email, password, role) => request('/auth/register', {
    method: 'POST',
    body: { username, email, password, role },
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Stats & Tournaments
  getStats: () => request('/stats'),
  getTournaments: () => request('/tournaments'),
  getTournament: (id) => request(`/tournaments/${id}`),
  createTournament: (data) => request('/tournaments', {
    method: 'POST',
    body: data,
  }),
  deleteTournament: (id) => request(`/tournaments/${id}`, { method: 'DELETE' }),

  // Tournament Actions
  enroll: (id) => request(`/tournaments/${id}/enroll`, { method: 'POST' }),
  leave: (id) => request(`/tournaments/${id}/leave`, { method: 'POST' }),
  removePlayer: (tournamentId, userId) => request(`/tournaments/${tournamentId}/remove/${userId}`, { method: 'POST' }),
  startTournament: (id) => request(`/tournaments/${id}/start`, { method: 'POST' }),
  recordScore: (matchId, score1, score2) => request(`/matches/${matchId}/result`, {
    method: 'POST',
    body: { score1, score2 },
  }),

  // Leaderboard & Player Profile
  getLeaderboard: () => request('/leaderboard'),
  getPlayer: (username) => request(`/players/${encodeURIComponent(username)}`),
}
