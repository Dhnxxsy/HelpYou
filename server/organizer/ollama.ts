import http from 'http';

/** Local Ollama server. Nothing is ever sent to the internet. */
export const OLLAMA_BASE = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');

export interface OllamaStatus {
  up: boolean;
  models: string[];
  error?: string;
}

export const OLLAMA_TIMEOUT_MS = 3000;

/** Probe the local Ollama instance and list available models. */
export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { up: false, models: [], error: `Ollama merespons dengan kode ${res.status}.` };
      const data: any = await res.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((m: any) => (typeof m?.name === 'string' ? m.name : '')).filter(Boolean).sort()
        : [];
      return { up: true, models };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    if ((e?.name || '') === 'AbortError') return { up: false, models: [], error: 'Ollama tidak merespons (timeout).' };
    return { up: false, models: [], error: (e?.message && String(e.message)) || 'Ollama tidak terhubung.' };
  }
}