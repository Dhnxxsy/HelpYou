import { useSyncExternalStore } from 'react';

export interface ChatMsg {
  role: 'user' | 'ai';
  content: string;
}

export interface ChatState {
  model: string;
  messages: ChatMsg[];
}

const LS_KEY = 'helpyou-overlay-chat';
const MAX_MESSAGES = 80;

function load(): ChatState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { model: '', messages: [] };
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed?.messages)
      ? parsed.messages
          .filter((m: unknown) => m && (m as ChatMsg).role !== undefined && typeof (m as ChatMsg).content === 'string')
          .slice(-MAX_MESSAGES)
      : [];
    return { model: typeof parsed?.model === 'string' ? parsed.model : '', messages };
  } catch {
    return { model: '', messages: [] };
  }
}

function persist(state: ChatState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* storage full/blocked — ignore, in-memory still works */
  }
}

let state: ChatState = load();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getChatState(): ChatState {
  return state;
}

export function setChatModel(model: string): void {
  if (state.model === model) return;
  state = { ...state, model };
  persist(state);
  emit();
}

export function appendUserMessage(content: string): void {
  if (!content.trim()) return;
  const combined: ChatMsg[] = [...state.messages, { role: 'user', content }];
  state = { ...state, messages: combined.slice(-MAX_MESSAGES) };
  persist(state);
  emit();
}

export function appendAiMessage(content: string): void {
  const combined: ChatMsg[] = [...state.messages, { role: 'ai', content }];
  state = { ...state, messages: combined.slice(-MAX_MESSAGES) };
  persist(state);
  emit();
}

export function updateLastAiMessage(content: string): void {
  const messages = state.messages;
  if (messages.length === 0 || messages[messages.length - 1].role !== 'ai') return;
  const copy = messages.slice();
  copy[copy.length - 1] = { role: 'ai', content };
  state = { ...state, messages: copy };
  persist(state);
  emit();
}

export function clearChat(): void {
  if (state.messages.length === 0) return;
  state = { ...state, messages: [] };
  persist(state);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Survives tab switches and overlay hide/show — data lives in localStorage. */
export function useChatStore(): ChatState {
  return useSyncExternalStore(subscribe, getChatState, getChatState);
}