'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useCallback } from 'react';
import Vortex from '@/components/Vortex';
import { addVoiceEntry, getVoiceLog, getRecentVoiceContext, type VoiceEntry } from '@/lib/voice-log';
import { createSpeechController, detectLanguage } from '@/lib/speech';
import { getBaseUrl, getConnectionStatus } from '@/lib/smart-router';
import PinLock from '@/components/PinLock';

type SunshineState = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function SunshineOS() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceEntry[]>([]);
  const [connection, setConnection] = useState<'local' | 'tunnel' | 'cloud'>('cloud');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');
  const baseUrlRef = useRef('');

  // Smart routing: detect best connection on mount
  useEffect(() => {
    getBaseUrl().then(url => {
      baseUrlRef.current = url;
      setConnection(getConnectionStatus());
    });
  }, []);

  const { messages, sendMessage: rawSendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { voiceContext: typeof window !== 'undefined' ? getRecentVoiceContext() : '' },
    }),
  });
  const isStreaming = status === 'streaming';

  // Wrap sendMessage to log entries
  const sendWithLog = useCallback((text: string, source: 'voice' | 'text') => {
    addVoiceEntry(text, source);
    setVoiceLogEntries(getVoiceLog());
    rawSendMessage({ text });
  }, [rawSendMessage]);

  // Load voice log on mount
  useEffect(() => {
    setVoiceLogEntries(getVoiceLog());
  }, []);

  // Derive SUNSHINE state
  const sunshineState: SunshineState = isListening
    ? 'listening'
    : isStreaming
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : 'idle';

  // Show chat when first message arrives
  useEffect(() => {
    if (messages.length > 0 && !showChat) setShowChat(true);
  }, [messages, showChat]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speech controller
  const speechRef = useRef<ReturnType<typeof createSpeechController> | null>(null);
  useEffect(() => {
    speechRef.current = createSpeechController();
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !speechRef.current) return;
    speechRef.current.speak(
      text,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
    );
  }, [voiceEnabled]);

  // Auto-speak new responses
  const lastMsgRef = useRef('');
  useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    const text = last.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('');
    if (text && text !== lastMsgRef.current) {
      lastMsgRef.current = text;
      speak(text);
    }
  }, [messages, isStreaming, speak]);

  // Voice input with 10-second silence buffer
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Send whatever we have
      if (transcriptRef.current.trim()) {
        sendWithLog(transcriptRef.current.trim(), 'voice');
        transcriptRef.current = '';
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    const recognition = new SpeechRecognition();
    // Auto-detect: default to Spanish, browser handles mixed language
    recognition.lang = '';  // empty = browser default (auto-detect)
    recognition.interimResults = true;
    recognition.continuous = true;

    transcriptRef.current = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      transcriptRef.current = fullTranscript;
      setInput(fullTranscript);

      // Reset 10-second silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop();
        if (transcriptRef.current.trim()) {
          sendWithLog(transcriptRef.current.trim(), 'voice');
          transcriptRef.current = '';
          setInput('');
        }
        setIsListening(false);
      }, 10000);
    };

    recognition.onerror = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setIsListening(false);
    };

    recognition.onend = () => {
      // If still listening (continuous mode ended unexpectedly), don't clear
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, sendWithLog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendWithLog(input, 'text');
    setInput('');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos dias';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const getStatusLabel = () => {
    switch (sunshineState) {
      case 'listening': return 'ESCUCHANDO';
      case 'thinking': return 'PROCESANDO';
      case 'speaking': return 'HABLANDO';
      default: return 'LISTA';
    }
  };

  const getStatusColor = () => {
    switch (sunshineState) {
      case 'listening': return 'text-red-400';
      case 'thinking': return 'text-cyan-400';
      case 'speaking': return 'text-amber-400';
      default: return 'text-emerald-400';
    }
  };

  // PIN only on mobile
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!authed && isMobile) {
    return <PinLock onUnlock={() => setAuthed(true)} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col relative grid-bg overflow-hidden">
      {/* Vortex background — always visible */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`transition-all duration-1000 ${showChat ? 'w-[200px] h-[200px] -translate-y-[35vh]' : 'w-[320px] h-[320px] sm:w-[400px] sm:h-[400px]'}`}>
          <Vortex state={sunshineState} />
        </div>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold sunshine-gradient tracking-[0.2em]">SUNSHINE</span>
          <span className={`text-[8px] tracking-wider px-2 py-0.5 rounded-full glass ${
            connection === 'local' ? 'text-emerald-400' :
            connection === 'tunnel' ? 'text-cyan-400' :
            'text-amber-400'
          }`}>
            {connection === 'local' ? 'LOCAL' : connection === 'tunnel' ? 'DIRECT' : 'CLOUD'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              speechRef.current?.stop();
              setIsSpeaking(false);
              setVoiceEnabled(!voiceEnabled);
            }}
            className={`glass rounded-full px-3 py-1 text-[10px] tracking-widest transition-all ${
              voiceEnabled ? 'text-cyan-400' : 'text-slate-600'
            }`}
          >
            {voiceEnabled ? 'VOZ' : 'MUTE'}
          </button>
          <button
            onClick={() => { setShowLog(!showLog); setVoiceLogEntries(getVoiceLog()); }}
            className="glass rounded-full px-3 py-1 text-[10px] tracking-widest text-slate-400 hover:text-cyan-400 transition-all"
          >
            LOG
          </button>
          <span className={`text-[10px] tracking-widest font-medium status-glow ${getStatusColor()}`}>
            {getStatusLabel()}
          </span>
        </div>
      </header>

      {/* Voice Log Panel */}
      {showLog && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <div className="glass-strong rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-sm font-medium sunshine-gradient tracking-wider">VOICE LOG</span>
              <div className="flex gap-2">
                <button
                  onClick={() => sendWithLog('Analiza mi voice log. Revisa mis patrones de habla, muletillas, estructura de frases, claridad, y dame feedback concreto para mejorar mi pitch y comunicacion profesional. Se especifica con ejemplos de lo que dije mal y como deberia decirlo.', 'text')}
                  className="glass rounded-full px-3 py-1 text-[10px] tracking-widest text-amber-400 hover:text-amber-300 transition-all"
                >
                  ANALIZAR
                </button>
                <button
                  onClick={() => setShowLog(false)}
                  className="text-slate-500 hover:text-slate-300 text-lg"
                >
                  x
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {voiceLogEntries.length === 0 ? (
                <p className="text-slate-600 text-xs text-center py-8">No hay entradas de voz todavia</p>
              ) : (
                [...voiceLogEntries].reverse().map((entry) => (
                  <div key={entry.id} className="glass rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] tracking-wider ${entry.source === 'voice' ? 'text-red-400' : 'text-cyan-400'}`}>
                        {entry.source === 'voice' ? 'MIC' : 'TXT'}
                      </span>
                      <span className="text-[9px] text-slate-600">
                        {new Date(entry.timestamp).toLocaleString('es-PR', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{entry.transcript}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Greeting — only when no messages */}
        {!showChat && (
          <div className="flex flex-col items-center text-center mt-20 space-y-3">
            <p className="text-slate-500 text-xs tracking-[0.3em] uppercase">{getGreeting()}</p>
            <p className="text-slate-400 text-sm max-w-xs">
              Soy SUNSHINE, tu operadora de inteligencia.<br />
              Habla o escribe.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm">
              {[
                'Plan de hoy',
                'Estado de negocios',
                'Necesito leads',
                'Analiza mi semana',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendWithLog(prompt, 'text')}
                  className="glass rounded-full px-4 py-2 text-[11px] text-slate-400 hover:text-cyan-400 hover:border-cyan-900 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {showChat && (
          <div className="flex-1 w-full max-w-2xl overflow-y-auto px-4 pt-24 pb-4 space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`msg-enter flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'glass-strong text-slate-200'
                      : 'glass text-slate-200'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <span className="text-[9px] text-amber-500/70 font-medium tracking-[0.2em] block mb-1">
                      SUNSHINE
                    </span>
                  )}
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <span key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="msg-enter flex justify-start">
                <div className="glass rounded-2xl px-4 py-3">
                  <span className="text-[9px] text-amber-500/70 font-medium tracking-[0.2em] block mb-1">SUNSHINE</span>
                  <span className="text-cyan-400 text-sm animate-pulse">...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <footer className="relative z-10 pb-8 pt-4 px-4">
        {/* Voice transcript preview */}
        {isListening && transcriptRef.current && (
          <div className="text-center mb-3">
            <span className="glass rounded-full px-4 py-2 text-xs text-slate-400 inline-block max-w-sm truncate">
              {input || '...'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 max-w-lg mx-auto">
          {/* Mic button */}
          <button
            onClick={toggleListening}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-red-500/20 border-2 border-red-500 text-red-400 rec-pulse'
                : 'glass text-slate-400 hover:text-cyan-400 border border-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isListening ? (
                <rect x="6" y="6" width="12" height="12" rx="2" />
              ) : (
                <>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </>
              )}
            </svg>
          </button>

          {/* Text input */}
          <form onSubmit={handleSubmit} className="flex-1 flex">
            <div className="glass rounded-full flex items-center w-full px-4 py-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? 'Escuchando...' : 'Escribe algo...'}
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
                disabled={isListening}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="ml-2 text-slate-500 hover:text-amber-400 disabled:opacity-20 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              </button>
            </div>
          </form>

          {/* Stop speaking */}
          {isSpeaking && (
            <button
              onClick={() => { speechRef.current?.stop(); setIsSpeaking(false); }}
              className="w-14 h-14 rounded-full glass flex items-center justify-center text-amber-400 animate-pulse border border-white/5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" x2="17" y1="9" y2="15" />
                <line x1="17" x2="23" y1="9" y2="15" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
