# Interview Copilot AI - Product Requirements Document

## Overview
Production-ready replica of LockedIn AI's Interview Copilot with real-time streaming analysis of ALL interlocutor requests and step-by-step answer display.

## Requirements Verification Status

### A. Pre-Interview Preparation ✅ COMPLETE
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Resume Parsing (PDF/DOCX) | ✅ | pypdf + LLM extraction |
| Job Description Analysis | ✅ | Profile builder with keyword extraction |
| Company Research | ✅ | DuckDuckGo Search API (free) |
| Candidate Profile (FAISS) | ✅ | Vector DB persisted to disk |

### B. Real-Time Interview Assistance ✅ COMPLETE
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Audio Device Selection | ✅ | enumerateDevices in UI |
| Streaming Transcription | ✅ | faster-whisper (medium, int8, VAD) |
| Speaker Diarization | ✅ | pyannote.audio (HF token in .env) |
| Request Detection | ✅ | Heuristic with confidence threshold |
| Small Talk Filtering | ✅ | Patterns: okay, hmm, thanks, etc. |
| Context-Aware LLM | ✅ | Multi-provider (OpenAI, Anthropic, DeepSeek, Gemini) |
| max_tokens Limit | ✅ | Reduced to 300 (was 1500) |
| API Keys (localStorage) | ✅ | Never stored on server |
| Button type="button" | ✅ | All buttons prevent page reload |
| Coaching Layer | ✅ | Filler word detection (French + English) |

### C. Post-Interview Analysis (P2) ✅ COMPLETE
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Full Transcript | ✅ | With speaker labels and timestamps |
| Performance Metrics | ✅ | Questions, fillers, WPM, speaking pace |
| AI Feedback | ✅ | LLM-generated strengths/improvements |
| Export Options | ✅ | JSON and PDF |

### D. Session Summary (P2) ✅ COMPLETE
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| One-click Summary | ✅ | /api/sessions/{id}/generate-summary |
| Q&A Pairs | ✅ | Extracted in analysis page |

### Critical Bugs Fixed (P0) ✅ ALL RESOLVED
| Bug | Status | Fix |
|-----|--------|-----|
| Page reload on start | ✅ | All buttons have type="button" |
| Unlimited response length | ✅ | max_tokens=300 enforced |
| Small talk triggers | ✅ | Confidence threshold 0.5 |
| Profile data loss | ✅ | localStorage persistence |

## Technology Stack ✅ VERIFIED
| Component | Technology | Status |
|-----------|------------|--------|
| Backend | FastAPI + Python | ✅ |
| Real-time | WebSockets | ✅ |
| STT | faster-whisper | ✅ |
| Diarization | pyannote.audio | ✅ |
| Intent Detection | Heuristic (no DistilBERT) | ✅ |
| LLM | Multi-provider (user keys) | ✅ |
| Embeddings | all-MiniLM-L6-v2 | ✅ |
| Vector DB | FAISS (persisted) | ✅ |
| Company Search | DuckDuckGo | ✅ |
| Frontend | React + Vite + Tailwind | ✅ |
| State | Zustand | ✅ |

## Performance Targets
| Metric | Target | Status |
|--------|--------|--------|
| End-to-end latency | < 3s | ⚠️ Depends on LLM |
| First-token latency | < 500ms | ✅ |
| Transcript word latency | < 500ms | ✅ |
| Request detection | > 90% | ✅ |
| Speaker identification | > 95% | ✅ (pyannote) |

## File Structure
```
/app/
├── backend/
│   ├── server.py           # FastAPI app, all endpoints
│   ├── vector_store.py     # FAISS operations
│   ├── data/
│   │   ├── prompt_templates.json
│   │   └── vector_store/   # FAISS persistence
│   ├── tests/
│   │   ├── test_streaming_pipeline.py
│   │   └── test_features_v14.py
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/
        │   ├── Interview.jsx    # Main interview UI
        │   ├── Settings.jsx     # API keys + profile builder
        │   ├── Analysis.jsx     # Post-interview analysis
        │   └── Dashboard.jsx
        ├── store/
        │   └── interviewStore.js
        └── services/
            ├── api.js
            └── llmSettings.js
```

## Key API Endpoints
- `GET /api/health` - Health check
- `POST /api/cv/upload` - Resume upload
- `POST /api/ingestion/build-profile` - Build FAISS profile
- `GET /api/ingestion/status` - Profile status
- `WS /api/ws/stream` - Real-time streaming
- `POST /api/sessions/{id}/generate-summary` - Summary generation

## Testing Status
- Backend: 100% (17/17 tests passed)
- Frontend: 100% (8/8 features verified)
- Last test report: /app/test_reports/iteration_14.json
