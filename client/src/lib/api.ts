/** Tiny fetch wrapper around the local backend (JSON in/out, throws with server message). */
import { translateServerMessage } from './i18n';

export async function api<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      const body = await res.json();
      if (body?.error) msg = translateServerMessage(String(body.error));
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}