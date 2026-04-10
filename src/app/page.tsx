'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect, useCallback } from 'react';

export default function SunshineOS() {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat();

  const isStreaming = status === 'streaming';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak the latest assistant message
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-PR';
    utterance.rate = 1.1;
    utterance.pitch = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  // Auto-speak new assistant messages when streaming finishes
  const lastMsgRef = useRef<string>('');
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

  // Voice input (speech-to-text)
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-PR';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendMessage({ text: transcript });
      setInput('');
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos dias';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="flex flex-col h-screen scanline">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#050d18]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold sunshine-gradient tracking-wider">
            SUNSHINE OS
          </h1>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {getGreeting()}, Operador
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              setIsSpeaking(false);
              setVoiceEnabled(!voiceEnabled);
            }}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              voiceEnabled
                ? 'border-cyan-800 text-cyan-400 bg-cyan-950/30'
                : 'border-slate-700 text-slate-500 bg-transparent'
            }`}
          >
            {voiceEnabled ? '[VOZ ON]' : '[VOZ OFF]'}
          </button>
          <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
            <div className="text-4xl sunshine-gradient font-bold">SUNSHINE</div>
            <p className="text-slate-400 text-sm max-w-md">
              Operador diario. Estratega de crecimiento. Closer de ventas.<br />
              Meta: $30K/mes. Sin excusas.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {[
                'Dame el plan de hoy',
                'Necesito mas leads para PR Pro',
                'Script de venta para chatbot AI',
                'Analiza mi pricing actual',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    sendMessage({ text: prompt });
                  }}
                  className="px-3 py-2 text-xs border border-slate-700 rounded text-slate-400 hover:border-cyan-700 hover:text-cyan-400 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`msg-enter flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'bg-[#0a1628] text-slate-200 border border-slate-800'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="text-[10px] text-amber-500 font-bold mb-1 tracking-widest">
                  SUNSHINE
                </div>
              )}
              {message.parts.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                      {part.text}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-[#0a1628] border border-slate-800 rounded-lg px-4 py-3 text-sm">
              <div className="text-[10px] text-amber-500 font-bold mb-1 tracking-widest">SUNSHINE</div>
              <span className="cursor-blink text-slate-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="border-t border-slate-800 bg-[#050d18] p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <button
            type="button"
            onClick={toggleListening}
            className={`p-3 rounded-lg border transition-all shrink-0 ${
              isListening
                ? 'bg-red-950/50 border-red-700 text-red-400 recording-glow'
                : 'border-slate-700 text-slate-400 hover:border-cyan-700 hover:text-cyan-400'
            }`}
            title={isListening ? 'Detener' : 'Hablar'}
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

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Escuchando...' : 'Escribe o habla...'}
            className="flex-1 bg-[#0a1020] border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
            disabled={isListening}
          />

          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="p-3 rounded-lg border border-slate-700 text-slate-400 hover:border-amber-600 hover:text-amber-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
              }}
              className="p-3 rounded-lg border border-amber-700 text-amber-400 animate-pulse shrink-0"
              title="Detener voz"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" x2="17" y1="9" y2="15" />
                <line x1="17" x2="23" y1="9" y2="15" />
              </svg>
            </button>
          )}
        </form>

        <div className="text-center mt-2">
          <span className="text-[10px] text-slate-600 tracking-wider">
            SUNSHINE OS v1.0 — META: $30K/MES
          </span>
        </div>
      </footer>
    </div>
  );
}
