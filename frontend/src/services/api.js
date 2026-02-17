import axios from 'axios';
import { buildLlmHeaders } from './llmSettings';


const withLlmHeaders = () => ({ headers: buildLlmHeaders() });

const API = import.meta.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_BACKEND_URL;
const ax = axios.create({ baseURL: API, headers: { 'Content-Type': 'application/json' } });


export const getActiveCV = () => ax.get('/api/cv/active').then(r => r.data);
export const uploadCV = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return ax.post('/api/cv/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
export const deleteCV = (id) => ax.delete(`/api/cv/${id}`).then(r => r.data);
export const reparseCV = () => ax.post('/api/cv/reparse').then(r => r.data);
export const getSessions = () => ax.get('/api/sessions').then(r => r.data);
export const getStats = () => ax.get('/api/sessions/stats').then(r => r.data);
export const createSession = (d) => ax.post('/api/sessions', d).then(r => r.data);
export const updateSession = (id, d) => ax.put(`/api/sessions/${id}`, d).then(r => r.data);
export const deleteSession = (id) => ax.delete(`/api/sessions/${id}`).then(r => r.data);
export const getMessages = (id) => ax.get(`/api/sessions/${id}/messages`).then(r => r.data);
export const processAudio = (d) => ax.post('/api/interview/process-audio', d).then(r => r.data);
export const generateSummary = (id) => ax.post(`/api/sessions/${id}/generate-summary`).then(r => r.data);
export const getSummary = (id) => ax.get(`/api/sessions/${id}/summary`).then(r => r.data);
