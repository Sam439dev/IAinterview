const STORAGE_KEY = 'llmSettings';

const defaultSettings = {
  provider: 'openai',
  model: 'gpt-4o',
  keys: {
    openai: '',
    anthropic: '',
    gemini: '',
    deepseek: ''
  },
  sttOpenAIKey: ''
};

export const loadLlmSettings = () => {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      keys: { ...defaultSettings.keys, ...(parsed?.keys || {}) }
    };
  } catch (e) {
    console.error('Failed to load LLM settings', e);
    return defaultSettings;
  }
};

export const saveLlmSettings = (settings) => {
  if (typeof window === 'undefined') return settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save LLM settings', e);
  }
  return settings;
};

export const getProviderKey = (settings) => settings?.keys?.[settings?.provider] || '';

export const hasActiveKey = (settings = loadLlmSettings()) => !!getProviderKey(settings);

export const buildLlmHeaders = () => {
  const settings = loadLlmSettings();
  const apiKey = getProviderKey(settings);
  const headers = {
    'X-LLM-Provider': settings.provider,
    'X-LLM-Model': settings.model,
    'X-LLM-Api-Key': apiKey
  };
  if (settings.sttOpenAIKey) {
    headers['X-STT-Api-Key'] = settings.sttOpenAIKey;
  }
  return headers;
};
