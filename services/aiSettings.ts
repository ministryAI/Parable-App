import { DEFAULT_PLAYBOOK, updatePlaybook } from '../lib/playbook';

// 'steward' is the user's own FastAPI server in front of Ollama (handles CORS, thinking, keep-alive).
export type AIServer = 'auto' | 'ollama' | 'steward' | 'openai';

export interface AISettings {
  enabled: boolean;
  baseUrl: string; // OpenAI-compatible base URL, e.g. http://localhost:11434/v1
  model: string;
  apiKey: string; // optional; most self-hosted servers ignore it (Steward needs its key)
  server: AIServer;
  useDocs: boolean; // Steward only: let it add passages from the user's documents
  usePlaybook: boolean; // Diana follows the Ministry Playbook when she drafts
  playbook: string;
}

// 'auto' guesses from the port, so a Tailscale https address should pick a type explicitly.
export const serverKind = (s: AISettings): Exclude<AIServer, 'auto'> =>
  s.server !== 'auto' ? s.server : /:11434(\/|$)/.test(s.baseUrl) ? 'ollama' : /:8787(\/|$)/.test(s.baseUrl) ? 'steward' : 'openai';

// Pull the address out of whatever was typed or pasted ("Ollama: http://localhost:11434/v1 " → the URL).
export const cleanBaseUrl = (u: string) => (u.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? u.trim()).replace(/\/+$/, '');

// http://localhost:8787/v1 → http://localhost:8787
export const serverOrigin = (s: AISettings) => cleanBaseUrl(s.baseUrl).replace(/\/v1$/, '');

const STORAGE_KEY = 'parable.aiSettings';

// AI is opt-in: the builder is fully usable without a server.
export const DEFAULT_SETTINGS: AISettings = {
  enabled: false,
  baseUrl: import.meta.env.VITE_AI_BASE_URL || 'http://localhost:11434/v1',
  model: import.meta.env.VITE_AI_MODEL || 'qwen3:8b',
  apiKey: import.meta.env.VITE_AI_API_KEY || '',
  server: 'auto',
  useDocs: false,
  usePlaybook: true,
  playbook: DEFAULT_PLAYBOOK,
};

export const loadSettings = (): AISettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Settings saved before the on/off switch existed belong to someone who already set up a server.
      const settings = { ...DEFAULT_SETTINGS, enabled: true, ...saved };
      return { ...settings, playbook: updatePlaybook(settings.playbook ?? '') };
    }
  } catch {
    // storage unavailable or corrupt; fall back to defaults
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AISettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable; settings last for this page load only
  }
};
