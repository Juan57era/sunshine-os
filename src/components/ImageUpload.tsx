'use client';

import { useRef } from 'react';

interface ImageUploadProps {
  onImageSelected: (base64: string, mimeType: string) => void;
  onClear: () => void;
  hasImage: boolean;
  previewSrc?: string;
}

export default function ImageUpload({ onImageSelected, onClear, hasImage, previewSrc }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:image/png;base64,XXXX" — strip the prefix
      const base64 = result.split(',')[1];
      onImageSelected(base64, mimeType);
    };
    reader.readAsDataURL(file);

    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClear();
  };

  if (hasImage && previewSrc) {
    return (
      <div className="relative flex-shrink-0">
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-full overflow-hidden border border-white/10 glass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Selected"
            className="w-full h-full object-cover"
          />
        </div>
        {/* Remove button */}
        <button
          type="button"
          onClick={handleClear}
          aria-label="Remove image"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Attach image"
        className="w-14 h-14 rounded-full glass flex items-center justify-center text-slate-400 hover:text-cyan-400 border border-white/5 transition-all flex-shrink-0"
      >
        {/* Camera icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      </button>
    </>
  );
}
