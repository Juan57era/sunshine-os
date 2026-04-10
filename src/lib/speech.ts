export interface SpeechController {
  speak: (text: string, onStart: () => void, onEnd: () => void) => void;
  stop: () => void;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/[═│┌┐└┘├┤]/g, '')
    .replace(/---+/g, ' ')
    .replace(/[*_~`#]/g, '')
    .trim();
}

// Split into chunks of ~800 chars at sentence boundaries
// Bigger chunks = smoother audio, fewer gaps
function splitIntoChunks(text: string): string[] {
  const cleaned = stripMarkdown(text);
  if (cleaned.length <= 1000) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.length > 1);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > 800 && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

export function createSpeechController(): SpeechController {
  let aborted = false;
  let currentAudio: HTMLAudioElement | null = null;
  const pendingUrls: string[] = [];

  async function fetchAudio(text: string): Promise<string | null> {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || aborted) return null;
      const blob = await res.blob();
      if (aborted) return null;
      const url = URL.createObjectURL(blob);
      pendingUrls.push(url);
      return url;
    } catch {
      return null;
    }
  }

  function cleanup(url: string) {
    const idx = pendingUrls.indexOf(url);
    if (idx !== -1) pendingUrls.splice(idx, 1);
    URL.revokeObjectURL(url);
  }

  return {
    speak: async (text: string, onStart: () => void, onEnd: () => void) => {
      // Reset
      aborted = true;
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      for (const url of pendingUrls.splice(0)) URL.revokeObjectURL(url);
      aborted = false;

      if (!text.trim()) { onEnd(); return; }

      const chunks = splitIntoChunks(text);
      if (chunks.length === 0) { onEnd(); return; }

      let startFired = false;

      async function playChunk(index: number, prefetchedUrl: string | null) {
        if (aborted) { onEnd(); return; }

        const url = prefetchedUrl ?? await fetchAudio(chunks[index]);
        if (!url || aborted) { onEnd(); return; }

        // Pre-fetch next chunk while this one plays
        const nextIdx = index + 1;
        const nextPromise = nextIdx < chunks.length
          ? fetchAudio(chunks[nextIdx])
          : Promise.resolve(null);

        const audio = new Audio(url);
        currentAudio = audio;

        audio.onplay = () => {
          if (!startFired) { startFired = true; onStart(); }
        };

        audio.onended = () => {
          cleanup(url);
          currentAudio = null;
          if (aborted) { onEnd(); return; }
          if (nextIdx < chunks.length) {
            nextPromise.then(nextUrl => playChunk(nextIdx, nextUrl));
          } else {
            onEnd();
          }
        };

        audio.onerror = () => {
          cleanup(url);
          currentAudio = null;
          if (nextIdx < chunks.length) {
            nextPromise.then(nextUrl => playChunk(nextIdx, nextUrl));
          } else {
            onEnd();
          }
        };

        audio.play().catch(() => { cleanup(url); currentAudio = null; onEnd(); });
      }

      const firstUrl = await fetchAudio(chunks[0]);
      if (!aborted && firstUrl) {
        playChunk(0, firstUrl);
      } else {
        if (firstUrl) cleanup(firstUrl);
        onEnd();
      }
    },

    stop: () => {
      aborted = true;
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      for (const url of pendingUrls.splice(0)) URL.revokeObjectURL(url);
    },
  };
}

export function detectLanguage(text: string): 'es' | 'en' {
  const es = (text.match(/\b(que|los|las|del|por|para|con|una|como|pero|está|esto|hay|tiene|puede|hacer|ahora|porque|entre)\b/gi) || []).length;
  const en = (text.match(/\b(the|and|for|are|but|not|you|all|can|was|has|its|how|new|now|see|two|did|get)\b/gi) || []).length;
  const accents = (text.match(/[áéíóúñ¿¡]/g) || []).length;
  return (es + accents * 2) > en ? 'es' : 'en';
}
