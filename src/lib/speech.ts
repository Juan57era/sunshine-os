type LangCode = 'es' | 'en';

interface VoiceConfig {
  voice: SpeechSynthesisVoice;
  rate: number;
  pitch: number;
}

// Preferred voices ranked by quality (best first)
const PREFERRED_VOICES: Record<LangCode, string[]> = {
  es: [
    'Paulina',          // macOS/iOS premium Spanish
    'Jimena',           // macOS/iOS Mexican Spanish
    'Monica',           // macOS/iOS Castilian
    'Google español',   // Chrome
    'Microsoft Sabina', // Windows
  ],
  en: [
    'Samantha',         // macOS/iOS premium
    'Karen',            // macOS/iOS Australian (clear)
    'Moira',            // macOS/iOS Irish (warm)
    'Google US English',// Chrome
    'Microsoft Zira',   // Windows
  ],
};

let voiceCache: Record<string, VoiceConfig | null> = {};
let voicesLoaded = false;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesLoaded = true;
      resolve(voices);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      voicesLoaded = true;
      resolve(speechSynthesis.getVoices());
    };
    // Fallback timeout
    setTimeout(() => resolve(speechSynthesis.getVoices()), 500);
  });
}

async function findBestVoice(lang: LangCode): Promise<VoiceConfig | null> {
  const cacheKey = lang;
  if (voiceCache[cacheKey] !== undefined) return voiceCache[cacheKey];

  const voices = await loadVoices();
  const preferred = PREFERRED_VOICES[lang];
  const langPrefix = lang === 'es' ? 'es' : 'en';

  // Try preferred voices first
  for (const name of preferred) {
    const match = voices.find(v =>
      v.name.includes(name) && v.lang.startsWith(langPrefix)
    );
    if (match) {
      const config: VoiceConfig = {
        voice: match,
        rate: 0.95,
        pitch: lang === 'es' ? 1.05 : 1.0,
      };
      voiceCache[cacheKey] = config;
      return config;
    }
  }

  // Fallback: any voice matching the language
  const fallback = voices.find(v => v.lang.startsWith(langPrefix));
  if (fallback) {
    const config: VoiceConfig = { voice: fallback, rate: 0.95, pitch: 1.0 };
    voiceCache[cacheKey] = config;
    return config;
  }

  voiceCache[cacheKey] = null;
  return null;
}

// Detect language from text (simple heuristic)
function detectLanguage(text: string): LangCode {
  const spanishIndicators = /\b(que|los|las|del|por|para|con|una|como|pero|más|está|esto|hay|son|tiene|puede|hacer|también|ahora|aquí|donde|cuando|porque|desde|entre|después|durante|sobre|contra|según|hacia|hasta|mediante)\b/i;
  const englishIndicators = /\b(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|has|its|let|say|she|too|use|way|who|did|get|him|his|how|its|may|new|now|old|see|two|any|few|got|off|own|put|run|set|try|add|big|end|far|few|key|lot|top)\b/i;

  const esMatches = (text.match(spanishIndicators) || []).length;
  const enMatches = (text.match(englishIndicators) || []).length;

  // Check for accented characters (strong Spanish signal)
  const accents = (text.match(/[áéíóúñ¿¡]/gi) || []).length;

  return (esMatches + accents * 2) > enMatches ? 'es' : 'en';
}

// Split text into natural sentences for better prosody
function splitIntoSentences(text: string): string[] {
  // Clean markdown
  const clean = text
    .replace(/#{1,6}\s/g, '')       // headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1')     // italic
    .replace(/`(.*?)`/g, '$1')       // code
    .replace(/---+/g, '')            // horizontal rules
    .replace(/═+/g, '')              // box chars
    .replace(/\n{2,}/g, '\n')        // multiple newlines
    .replace(/[-•]\s/g, '')          // bullet points
    .replace(/\d+\.\s/g, '')         // numbered lists
    .trim();

  // Split on sentence boundaries
  const sentences = clean.split(/(?<=[.!?…])\s+|(?<=\n)/).filter(s => s.trim().length > 2);

  return sentences;
}

export interface SpeechController {
  speak: (text: string, onStart: () => void, onEnd: () => void) => void;
  stop: () => void;
  isSpeaking: () => boolean;
}

export function createSpeechController(): SpeechController {
  let currentOnEnd: (() => void) | null = null;

  return {
    speak: async (text: string, onStart: () => void, onEnd: () => void) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const lang = detectLanguage(text);
      const voiceConfig = await findBestVoice(lang);
      const sentences = splitIntoSentences(text);

      if (sentences.length === 0) return;

      currentOnEnd = onEnd;
      let started = false;

      // Speak sentences sequentially for natural pacing
      const speakNext = (index: number) => {
        if (index >= sentences.length) {
          currentOnEnd?.();
          currentOnEnd = null;
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index]);

        if (voiceConfig) {
          utterance.voice = voiceConfig.voice;
          utterance.rate = voiceConfig.rate;
          utterance.pitch = voiceConfig.pitch;
        } else {
          utterance.lang = lang === 'es' ? 'es-US' : 'en-US';
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
        }

        utterance.volume = 1.0;

        utterance.onstart = () => {
          if (!started) {
            started = true;
            onStart();
          }
        };

        utterance.onend = () => {
          speakNext(index + 1);
        };

        utterance.onerror = () => {
          speakNext(index + 1);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext(0);
    },

    stop: () => {
      window.speechSynthesis.cancel();
      currentOnEnd?.();
      currentOnEnd = null;
    },

    isSpeaking: () => window.speechSynthesis.speaking,
  };
}

export { detectLanguage };
