'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useCallback } from 'react';
import Vortex from '@/components/Vortex';
import ImageUpload from '@/components/ImageUpload';
import { addVoiceEntry, getVoiceLog, getRecentVoiceContext, type VoiceEntry } from '@/lib/voice-log';
import { createSpeechController } from '@/lib/speech';
import { getBaseUrl, getConnectionStatus } from '@/lib/smart-router';

type SunshineState = 'idle' | 'listening' | 'thinking' | 'speaking';

function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 25 : 50);
  }
}

export default function SunshineOS() {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceEntry[]>([]);
  const [connection, setConnection] = useState<'local' | 'tunnel' | 'cloud'>('cloud');
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [briefingDone, setBriefingDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');

  // Smart routing
  useEffect(() => {
    getBaseUrl().then(() => setConnection(getConnectionStatus()));
  }, []);

  const { messages, sendMessage: rawSendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { voiceContext: typeof window !== 'undefined' ? getRecentVoiceContext() : '' },
    }),
  });
  const isStreaming = status === 'streaming';

  // Send with logging + image support + haptic
  const sendWithLog = useCallback((text: string, source: 'voice' | 'text') => {
    addVoiceEntry(text, source);
    setVoiceLogEntries(getVoiceLog());
    haptic('medium');

    if (imageData) {
      const byteChars = atob(imageData.base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const file = new File([byteArray], 'image.jpg', { type: imageData.mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      rawSendMessage({ text, files: dt.files });
      setImageData(null);
      setImagePreview(undefined);
    } else {
      rawSendMessage({ text });
    }
  }, [rawSendMessage, imageData]);

  // Load voice log on mount
  useEffect(() => { setVoiceLogEntries(getVoiceLog()); }, []);

  // Derive SUNSHINE state
  const sunshineState: SunshineState = isListening
    ? 'listening'
    : isStreaming
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : 'idle';

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speech controller
  const speechRef = useRef<ReturnType<typeof createSpeechController> | null>(null);
  useEffect(() => { speechRef.current = createSpeechController(); }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !speechRef.current) return;
    haptic('light');
    speechRef.current.speak(
      text,
      () => setIsSpeaking(true),
      () => { setIsSpeaking(false); haptic('light'); },
    );
  }, [voiceEnabled]);

  // Auto-speak new assistant responses
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
      // Mark briefing as done after first assistant response
      if (!briefingDone) setBriefingDone(true);
    }
  }, [messages, isStreaming, speak, briefingDone]);

  // Auto-briefing on first load
  const briefingSentRef = useRef(false);
  useEffect(() => {
    if (briefingSentRef.current || messages.length > 0) return;
    briefingSentRef.current = true;
    const timer = setTimeout(() => {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
      rawSendMessage({ text: greeting });
    }, 1500);
    return () => clearTimeout(timer);
  }, [messages.length, rawSendMessage]);

  // Voice input with 10-second silence buffer
  const toggleListening = useCallback(() => {
    haptic('heavy');
    if (isListening) {
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (transcriptRef.current.trim()) {
        sendWithLog(transcriptRef.current.trim(), 'voice');
        transcriptRef.current = '';
      }
      setIsListening(false);
      return;
    }

    // Stop SUNSHINE from speaking when user starts talking
    speechRef.current?.stop();
    setIsSpeaking(false);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = '';
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
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, sendWithLog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    speechRef.current?.stop();
    setIsSpeaking(false);
    sendWithLog(input, 'text');
    setInput('');
  };

  const saveSession = useCallback(async () => {
    if (messages.length < 2) return;
    const text = messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text'))
      .map(p => p.text).join('\n');
    await fetch('/api/vault/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: text.slice(0, 500), decisions: [], tasks: [], projects: ['sunshine-os'] }),
    });
    haptic('medium');
  }, [messages]);

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

  // Filter messages: hide the auto-briefing exchange (first user greeting + first assistant briefing)
  const visibleMessages = briefingDone
    ? messages.filter((_, i) => i > 1) // skip greeting + briefing
    : [];

  const hasUserMessages = visibleMessages.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col relative grid-bg overflow-hidden">
      {/* Vortex */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`transition-all duration-1000 ${hasUserMessages ? 'w-[180px] h-[180px] -translate-y-[36vh]' : 'w-[300px] h-[300px] sm:w-[400px] sm:h-[400px]'}`}>
          <Vortex state={sunshineState} />
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold sunshine-gradient tracking-[0.2em]">SUNSHINE</span>
          <span className={`text-[7px] tracking-wider px-1.5 py-0.5 rounded-full glass ${
            connection === 'local' ? 'text-emerald-400' : connection === 'tunnel' ? 'text-cyan-400' : 'text-amber-400'
          }`}>
            {connection === 'local' ? 'LOCAL' : connection === 'tunnel' ? 'DIRECT' : 'CLOUD'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { speechRef.current?.stop(); setIsSpeaking(false); setVoiceEnabled(!voiceEnabled); }}
            className={`glass rounded-full px-2 py-1 text-[9px] tracking-widest transition-all ${voiceEnabled ? 'text-cyan-400' : 'text-slate-600'}`}
          >
            {voiceEnabled ? 'VOZ' : 'MUTE'}
          </button>
          <button
            onClick={() => { setShowLog(!showLog); setVoiceLogEntries(getVoiceLog()); }}
            className="glass rounded-full px-2 py-1 text-[9px] tracking-widest text-slate-400 hover:text-cyan-400 transition-all"
          >
            LOG
          </button>
          <button
            onClick={saveSession}
            className="glass rounded-full px-2 py-1 text-[9px] tracking-widest text-slate-400 hover:text-amber-400 transition-all"
          >
            SAVE
          </button>
          <span className={`text-[9px] tracking-widest font-medium status-glow ${getStatusColor()}`}>
            {getStatusLabel()}
          </span>
        </div>
      </header>

      {/* Voice Log Panel */}
      {showLog && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4" onClick={() => setShowLog(false)}>
          <div className="glass-strong rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-sm font-medium sunshine-gradient tracking-wider">VOICE LOG</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { sendWithLog('Analiza mi voice log completo. Patrones de habla, muletillas, estructura, claridad. Feedback concreto con ejemplos.', 'text'); setShowLog(false); }}
                  className="glass rounded-full px-3 py-1 text-[10px] tracking-widest text-amber-400"
                >
                  ANALIZAR
                </button>
                <button onClick={() => setShowLog(false)} className="text-slate-500 hover:text-slate-300 px-1">x</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {voiceLogEntries.length === 0 ? (
                <p className="text-slate-600 text-xs text-center py-8">No hay entradas todavia</p>
              ) : (
                [...voiceLogEntries].reverse().map((entry) => (
                  <div key={entry.id} className="glass rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] tracking-wider ${entry.source === 'voice' ? 'text-red-400' : 'text-cyan-400'}`}>
                        {entry.source === 'voice' ? 'MIC' : 'TXT'}
                      </span>
                      <span className="text-[9px] text-slate-600">
                        {new Date(entry.timestamp).toLocaleString('es-PR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

      {/* Center */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Waiting state — vortex only, no text clutter */}
        {!hasUserMessages && (
          <div className="flex flex-col items-center text-center mt-24 space-y-6">
            {!briefingDone && messages.length > 0 && (
              <p className="text-slate-500 text-[10px] tracking-[0.3em] animate-pulse">BRIEFING EN CURSO</p>
            )}
            {briefingDone && (
              <>
                <p className="text-slate-400 text-xs max-w-xs">
                  Briefing completado. Habla o escribe, Capitan.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                  {['Plan de hoy', 'Estado de negocios', 'Necesito leads', 'Analiza mi semana'].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendWithLog(prompt, 'text')}
                      className="glass rounded-full px-4 py-2 text-[11px] text-slate-400 hover:text-cyan-400 transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Chat messages — only user-initiated conversations */}
        {hasUserMessages && (
          <div className="flex-1 w-full max-w-2xl overflow-y-auto px-4 pt-20 pb-4 space-y-3">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`msg-enter flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user' ? 'glass-strong text-slate-200' : 'glass text-slate-200'
                }`}>
                  {message.role === 'assistant' && (
                    <span className="text-[9px] text-amber-500/70 font-medium tracking-[0.2em] block mb-1">SUNSHINE</span>
                  )}
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return <span key={`${message.id}-${i}`} className="whitespace-pre-wrap">{part.text}</span>;
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}

            {isStreaming && messages.length > 2 && (
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
      <footer className="relative z-10 pb-6 pt-3 px-4">
        {isListening && (
          <div className="text-center mb-2">
            <span className="glass rounded-full px-4 py-1.5 text-xs text-slate-400 inline-block max-w-sm truncate">
              {input || 'Escuchando...'}
            </span>
          </div>
        )}

        {imagePreview && (
          <div className="text-center mb-2">
            <span className="glass rounded-full px-3 py-1 text-[10px] text-cyan-400 inline-block">Imagen adjunta</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 max-w-lg mx-auto">
          {/* Mic */}
          <button
            onClick={toggleListening}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 ${
              isListening
                ? 'bg-red-500/20 border-2 border-red-500 text-red-400 rec-pulse'
                : 'glass text-slate-400 hover:text-cyan-400 border border-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

          {/* Camera */}
          <ImageUpload
            onImageSelected={(b64, mime) => { setImageData({ base64: b64, mimeType: mime }); setImagePreview(`data:${mime};base64,${b64}`); haptic('light'); }}
            onClear={() => { setImageData(null); setImagePreview(undefined); }}
            hasImage={!!imageData}
            previewSrc={imagePreview}
          />

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex-1 flex">
            <div className="glass rounded-full flex items-center w-full px-4 py-2.5">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? 'Escuchando...' : imageData ? 'Describe la imagen...' : 'Habla o escribe...'}
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
              className="w-12 h-12 rounded-full glass flex items-center justify-center text-amber-400 animate-pulse border border-white/5 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
