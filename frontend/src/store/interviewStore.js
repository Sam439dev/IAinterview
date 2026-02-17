import { create } from 'zustand';

const fillerWords = ['um', 'euh', 'like', 'uh'];
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useInterviewStore = create((set, get) => ({
  transcriptLines: [],
  suggestions: [],
  coachingTips: [],
  fillerCounts: {},
  clearSession: () => set({ transcriptLines: [], suggestions: [], coachingTips: [], fillerCounts: {} }),
  addTranscriptLine: (line) => set(state => ({
    transcriptLines: [...state.transcriptLines, { id: createId(), ...line }]
  })),
  addSuggestionStart: (id) => set(state => ({
    suggestions: [...state.suggestions, { id, preview: '', fullText: '', expanded: false }]
  })),
  addSuggestionDelta: (id, delta) => set(state => ({
    suggestions: state.suggestions.map(s => {
      if (s.id !== id) return s;
      const fullText = s.fullText + delta;
      const preview = fullText.length > 220 ? `${fullText.slice(0, 220)}...` : fullText;
      return { ...s, fullText, preview };
    })
  })),
  toggleSuggestion: (id) => set(state => ({
    suggestions: state.suggestions.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s)
  })),
  updateFillerCounts: (text) => set(state => {
    const counts = { ...state.fillerCounts };
    const lower = text.toLowerCase();

    fillerWords.forEach(word => {
      const matches = lower.match(new RegExp(`\\b${word}\\b`, 'g')) || [];
      if (matches.length) {
        counts[word] = (counts[word] || 0) + matches.length;
      }
    });

    let tips = [...state.coachingTips];
    fillerWords.forEach(word => {
      if (counts[word] && counts[word] % 3 === 0) {
        tips = [{ id: createId(), text: `Vous avez dit "${word}" ${counts[word]} fois. Essayez de ralentir.` }, ...tips];
      }
    });

    tips = tips.slice(0, 3);
    return { fillerCounts: counts, coachingTips: tips };
  })
}));
