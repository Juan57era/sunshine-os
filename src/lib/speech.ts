export interface SpeechController {
  speak: (text: string, onStart: () => void, onEnd: () => void) => void;
  stop: () => void;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')          // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // inline/block code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '')         // list bullets
    .replace(/^\d+\.\s+/gm, '')         // numbered lists
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/[*_~`#]/g, '')            // leftover special chars
    .trim();
}

function splitSentences(text: string): string[] {
  const cleaned = stripMarkdown(text);

  // Split on sentence-ending punctuation followed by space or newline,
  // or on newlines themselves
  const raw = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  return raw;
}

export function createSpeechController(): SpeechController {
  let aborted = false;
  let currentAudio: HTMLAudioElement | null = null;
  // Track all object URLs created so we can revoke on stop
  const pendingUrls: string[] = [];

  async function fetchAudio(sentence: string): Promise<string | null> {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
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

  function revokeUrl(url: string) {
    const idx = pendingUrls.indexOf(url);
    if (idx !== -1) pendingUrls.splice(idx, 1);
    URL.revokeObjectURL(url);
  }

  return {
    speak: async (text: string, onStart: () => void, onEnd: () => void) => {
      // Stop any ongoing playback first
      aborted = true;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      // Revoke any pending URLs
      for (const url of pendingUrls.splice(0)) {
        URL.revokeObjectURL(url);
      }

      aborted = false;

      if (!text.trim()) {
        onEnd();
        return;
      }

      const sentences = splitSentences(text);
      if (sentences.length === 0) {
        onEnd();
        return;
      }

      let startFired = false;

      // Pre-fetch the first sentence immediately, start fetching second in parallel
      async function playQueue(index: number, prefetchedUrl: string | null) {
        if (aborted) {
          onEnd();
          return;
        }

        // Resolve URL: either use prefetched or fetch now
        const url = prefetchedUrl ?? await fetchAudio(sentences[index]);

        if (!url || aborted) {
          onEnd();
          return;
        }

        // Start pre-fetching the next sentence while this one loads
        const nextIndex = index + 1;
        const prefetchPromise: Promise<string | null> =
          nextIndex < sentences.length ? fetchAudio(sentences[nextIndex]) : Promise.resolve(null);

        const audio = new Audio(url);
        currentAudio = audio;

        audio.onplay = () => {
          if (!startFired) {
            startFired = true;
            onStart();
          }
        };

        audio.onended = () => {
          revokeUrl(url);
          currentAudio = null;
          if (aborted) {
            onEnd();
            return;
          }
          if (nextIndex < sentences.length) {
            prefetchPromise.then(nextUrl => playQueue(nextIndex, nextUrl));
          } else {
            onEnd();
          }
        };

        audio.onerror = () => {
          revokeUrl(url);
          currentAudio = null;
          if (aborted) {
            onEnd();
            return;
          }
          // Skip failed sentence, continue queue
          if (nextIndex < sentences.length) {
            prefetchPromise.then(nextUrl => playQueue(nextIndex, nextUrl));
          } else {
            onEnd();
          }
        };

        audio.play().catch(() => {
          revokeUrl(url);
          currentAudio = null;
          onEnd();
        });
      }

      // Kick off: pre-fetch sentence 0 right away
      const firstUrl = await fetchAudio(sentences[0]);
      if (!aborted) {
        playQueue(0, firstUrl);
      } else {
        if (firstUrl) revokeUrl(firstUrl);
        onEnd();
      }
    },

    stop: () => {
      aborted = true;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      for (const url of pendingUrls.splice(0)) {
        URL.revokeObjectURL(url);
      }
    },
  };
}

// Language detection for voice recognition
export function detectLanguage(text: string): 'es' | 'en' {
  const spanishIndicators = /\b(que|los|las|del|por|para|con|una|como|pero|más|está|esto|hay|son|tiene|puede|hacer|también|ahora|aquí|donde|cuando|porque|desde|entre|después)\b/i;
  const englishIndicators = /\b(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|has|its|let|say|she|too|use|way|who|did|get|him|his|how|may|new|now|see|two)\b/i;

  const esMatches = (text.match(spanishIndicators) || []).length;
  const enMatches = (text.match(englishIndicators) || []).length;
  const accents = (text.match(/[áéíóúñ¿¡]/gi) || []).length;

  return (esMatches + accents * 2) > enMatches ? 'es' : 'en';
}
