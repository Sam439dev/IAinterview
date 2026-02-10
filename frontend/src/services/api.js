import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Settings
export const getSettings = () => api.get('/api/settings').then(r => r.data);
export const saveSettings = (data) => api.post('/api/settings', data).then(r => r.data);

// CV
export const getActiveCV = () => api.get('/api/cv/active').then(r => r.data);
export const uploadCV = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/api/cv/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
export const deleteCV = (id) => api.delete(`/api/cv/${id}`).then(r => r.data);

// Sessions
export const getSessions = () => api.get('/api/sessions').then(r => r.data);
export const getSessionStats = () => api.get('/api/sessions/stats').then(r => r.data);
export const createSession = (data) => api.post('/api/sessions', data).then(r => r.data);
export const updateSession = (id, data) => api.put(`/api/sessions/${id}`, data).then(r => r.data);
export const deleteSession = (id) => api.delete(`/api/sessions/${id}`).then(r => r.data);
export const getSessionMessages = (id) => api.get(`/api/sessions/${id}/messages`).then(r => r.data);

// Interview
export const processAudio = (data) => api.post('/api/interview/process-audio', data).then(r => r.data);

export default api;
