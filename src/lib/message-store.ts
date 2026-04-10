const STORAGE_KEY = 'sunshine-messages';
const MAX_MESSAGES = 100;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export function loadMessages(): StoredMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: StoredMessage[]): void {
  if (typeof window === 'undefined') return;
  const trimmed = messages.slice(-MAX_MESSAGES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function appendMessage(message: StoredMessage): StoredMessage[] {
  const current = loadMessages();
  const updated = [...current, message].slice(-MAX_MESSAGES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearMessages(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
