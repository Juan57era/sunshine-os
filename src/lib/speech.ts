export interface SpeechController {
  speak: (text: string, onStart: () => void, onEnd: () => void) => void;
  stop: () => void;
}

export function createSpeechController(): SpeechController {
  let currentAudio: HTMLAudioElement | null = null;
  let aborted = false;

  return {
    speak: async (text: string, onStart: () => void, onEnd: () => void) => {
      aborted = false;

      // Stop any current playback
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }

      if (!text.trim()) return;

      try {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (!res.ok || aborted) {
          onEnd();
          return;
        }

        const blob = await res.blob();
        if (aborted) { onEnd(); return; }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onplay = () => onStart();
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          onEnd();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudio = null;
          onEnd();
        };

        audio.play();
      } catch {
        onEnd();
      }
    },

    stop: () => {
      aborted = true;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
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
