import { create } from 'zustand';

// Filler words in French and English
const fillerWords = {
  // French fillers
  'euh': { label: 'Euh', lang: 'fr' },
  'heu': { label: 'Heu', lang: 'fr' },
  'ben': { label: 'Ben', lang: 'fr' },
  'bah': { label: 'Bah', lang: 'fr' },
  'donc': { label: 'Donc', lang: 'fr' },
  'voilà': { label: 'Voilà', lang: 'fr' },
  'genre': { label: 'Genre', lang: 'fr' },
  'en fait': { label: 'En fait', lang: 'fr' },
  // English fillers
  'um': { label: 'Um', lang: 'en' },
  'uh': { label: 'Uh', lang: 'en' },
  'like': { label: 'Like', lang: 'en' },
  'you know': { label: 'You know', lang: 'en' },
  'so': { label: 'So', lang: 'en' },
  'basically': { label: 'Basically', lang: 'en' },
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Memory limits to prevent crashes
const MAX_TRANSCRIPT_LINES = 200;
const MAX_SUGGESTIONS = 50;
const MAX_SUGGESTION_TEXT_LENGTH = 2000;

// Initial state for reset
const initialState = {
  transcriptLines: [],
  suggestions: [],
  coachingTips: [],
  fillerCounts: {},
  totalFillers: 0,
};

export const useInterviewStore = create((set, get) => ({
  ...initialState,
  
  // Full reset - returns to initial state
  resetStore: () => {
    console.log('[STORE] Full reset');
    set(initialState);
  },
  
  clearSession: () => {
    console.log('[STORE] Clear session');
    set({ 
      transcriptLines: [], 
      suggestions: [], 
      coachingTips: [], 
      fillerCounts: {},
      totalFillers: 0 
    });
  },
  
  addTranscriptLine: (line) => set(state => {
    // Limit transcript lines to prevent memory overflow
    const newLines = [...state.transcriptLines, { id: createId(), ...line }];
    if (newLines.length > MAX_TRANSCRIPT_LINES) {
      // Remove oldest entries
      return { transcriptLines: newLines.slice(-MAX_TRANSCRIPT_LINES) };
    }
    return { transcriptLines: newLines };
  }),
  
  addSuggestionStart: (id, request = '') => set(state => {
    const newSuggestions = [...state.suggestions, { id, request, preview: '', fullText: '', expanded: false }];
    // Limit suggestions to prevent memory overflow
    if (newSuggestions.length > MAX_SUGGESTIONS) {
      return { suggestions: newSuggestions.slice(-MAX_SUGGESTIONS) };
    }
    return { suggestions: newSuggestions };
  }),
  
  addSuggestionDelta: (id, delta) => set(state => ({
    suggestions: state.suggestions.map(s => {
      if (s.id !== id) return s;
      // Limit text length to prevent memory issues
      let fullText = s.fullText + delta;
      if (fullText.length > MAX_SUGGESTION_TEXT_LENGTH) {
        fullText = fullText.slice(0, MAX_SUGGESTION_TEXT_LENGTH);
      }
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
    let newFillers = 0;

    Object.keys(fillerWords).forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(regex) || [];
      if (matches.length) {
        counts[word] = (counts[word] || 0) + matches.length;
        newFillers += matches.length;
      }
    });

    let tips = [...state.coachingTips];
    
    // Generate coaching tips when filler count reaches thresholds
    Object.entries(counts).forEach(([word, count]) => {
      const info = fillerWords[word];
      if (info && count > 0 && count % 3 === 0) {
        const tip = info.lang === 'fr'
          ? `Vous avez dit "${info.label}" ${count} fois. Essayez de faire une pause.`
          : `You said "${info.label}" ${count} times. Try pausing instead.`;
        
        // Avoid duplicate tips
        if (!tips.some(t => t.text.includes(info.label) && t.text.includes(String(count)))) {
          tips = [{ id: createId(), text: tip, type: 'filler', word }, ...tips];
        }
      }
    });

    // Keep only last 5 tips
    tips = tips.slice(0, 5);
    
    return { 
      fillerCounts: counts, 
      coachingTips: tips,
      totalFillers: state.totalFillers + newFillers
    };
  }),

  // Get top fillers for display
  getTopFillers: () => {
    const state = get();
    return Object.entries(state.fillerCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word, count]) => ({
        word,
        count,
        label: fillerWords[word]?.label || word
      }));
  }
}));
