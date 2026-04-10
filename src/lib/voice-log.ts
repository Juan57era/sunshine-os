export interface VoiceEntry {
  id: string;
  timestamp: string;
  transcript: string;
  source: 'voice' | 'text';
  duration?: number;
}

const STORAGE_KEY = 'sunshine-voice-log';
const MAX_ENTRIES = 500;

export function getVoiceLog(): VoiceEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addVoiceEntry(transcript: string, source: 'voice' | 'text'): VoiceEntry {
  const entry: VoiceEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    transcript,
    source,
  };

  const log = getVoiceLog();
  log.push(entry);

  // Keep only latest entries
  const trimmed = log.slice(-MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

  return entry;
}

export function getRecentVoiceContext(count: number = 20): string {
  const log = getVoiceLog();
  const recent = log.filter(e => e.source === 'voice').slice(-count);

  if (recent.length === 0) return '';

  const entries = recent.map(e => {
    const date = new Date(e.timestamp).toLocaleString('es-PR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `[${date}] ${e.transcript}`;
  }).join('\n');

  return `\n\n═══════════════════════════════
VOICE LOG — ÚLTIMAS ${recent.length} ENTRADAS DE VOZ
═══════════════════════════════
${entries}`;
}

export function clearVoiceLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}
