'use client';

import { useState, useRef, useEffect } from 'react';

interface PinLockProps {
  onUnlock: () => void;
}

const PIN = '6955';

export default function PinLock({ onUnlock }: PinLockProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Check if already authenticated this session
    if (sessionStorage.getItem('sunshine-auth') === 'true') {
      onUnlock();
      return;
    }
    inputRefs.current[0]?.focus();
  }, [onUnlock]);

  const handleInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    setError(false);

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check PIN when all 4 digits entered
    if (value && index === 3) {
      const pin = newDigits.join('');
      if (pin === PIN) {
        sessionStorage.setItem('sunshine-auth', 'true');
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => {
          setDigits(['', '', '', '']);
          inputRefs.current[0]?.focus();
        }, 500);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center grid-bg">
      <div className="flex flex-col items-center gap-6">
        <span className="text-2xl font-bold sunshine-gradient tracking-[0.3em]">SUNSHINE</span>
        <p className="text-slate-500 text-xs tracking-widest">INGRESA PIN</p>

        <div className="flex gap-3">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={`w-14 h-14 text-center text-xl rounded-xl glass focus:outline-none transition-all ${
                error
                  ? 'border-red-500 text-red-400 animate-shake'
                  : digit
                    ? 'border-cyan-800 text-cyan-400'
                    : 'border-white/5 text-slate-400'
              }`}
              autoComplete="off"
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-xs tracking-wider">PIN INCORRECTO</p>
        )}
      </div>
    </div>
  );
}
