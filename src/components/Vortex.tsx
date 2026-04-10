'use client';

import { useRef, useEffect, useCallback } from 'react';

type VortexState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VortexProps {
  state: VortexState;
  className?: string;
}

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  opacity: number;
  layer: number;
  drift: number;
}

const STATE_CONFIG = {
  idle: { speed: 0.3, particles: 120, glow: 0.4, color: [0, 212, 255], pulseSpeed: 0.005, spread: 1.0 },
  listening: { speed: 0.8, particles: 180, glow: 0.7, color: [255, 120, 50], pulseSpeed: 0.015, spread: 1.3 },
  thinking: { speed: 1.2, particles: 200, glow: 0.9, color: [0, 212, 255], pulseSpeed: 0.025, spread: 0.8 },
  speaking: { speed: 0.6, particles: 160, glow: 0.6, color: [245, 158, 11], pulseSpeed: 0.01, spread: 1.1 },
};

export default function Vortex({ state, className = '' }: VortexProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const currentStateRef = useRef<VortexState>(state);

  currentStateRef.current = state;

  const createParticles = useCallback((count: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 20 + Math.random() * 120,
        speed: 0.2 + Math.random() * 0.8,
        size: 0.5 + Math.random() * 2,
        opacity: 0.1 + Math.random() * 0.6,
        layer: Math.floor(Math.random() * 3),
        drift: (Math.random() - 0.5) * 0.5,
      });
    }
    return particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    particlesRef.current = createParticles(200);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      const config = STATE_CONFIG[currentStateRef.current];
      timeRef.current += config.pulseSpeed;

      const pulse = Math.sin(timeRef.current) * 0.3 + 0.7;
      const breathe = Math.sin(timeRef.current * 0.7) * 0.15 + 1;

      ctx.clearRect(0, 0, w, h);

      // Core glow
      const coreRadius = 30 * breathe * config.spread;
      const [r, g, b] = config.color;

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 3);
      coreGrad.addColorStop(0, `rgba(${r},${g},${b},${config.glow * pulse * 0.5})`);
      coreGrad.addColorStop(0.3, `rgba(${r},${g},${b},${config.glow * pulse * 0.2})`);
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, w, h);

      // Inner core
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      innerGrad.addColorStop(0, `rgba(255,255,255,${0.15 * pulse})`);
      innerGrad.addColorStop(0.5, `rgba(${r},${g},${b},${0.1 * pulse})`);
      innerGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Orbital rings
      for (let ring = 0; ring < 3; ring++) {
        const ringRadius = (50 + ring * 35) * breathe * config.spread;
        const ringOpacity = (0.08 - ring * 0.02) * pulse * config.glow;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${ringOpacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Particles
      const particles = particlesRef.current;
      for (let i = 0; i < Math.min(particles.length, config.particles); i++) {
        const p = particles[i];
        p.angle += p.speed * config.speed * 0.02 * (p.layer === 0 ? 1 : p.layer === 1 ? -0.7 : 0.5);
        p.radius += p.drift * Math.sin(timeRef.current + i);

        // Keep radius in bounds
        if (p.radius < 15) p.radius = 15 + Math.random() * 10;
        if (p.radius > 140 * config.spread) p.radius = 20 + Math.random() * 30;

        const pr = p.radius * breathe * config.spread;
        const px = cx + Math.cos(p.angle) * pr;
        const py = cy + Math.sin(p.angle) * pr;

        const pOpacity = p.opacity * pulse * config.glow;
        const pSize = p.size * (1 + pulse * 0.3);

        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${pOpacity})`;
        ctx.fill();

        // Particle trail
        const trailX = cx + Math.cos(p.angle - 0.1 * config.speed) * pr;
        const trailY = cy + Math.sin(p.angle - 0.1 * config.speed) * pr;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(trailX, trailY);
        ctx.strokeStyle = `rgba(${r},${g},${b},${pOpacity * 0.3})`;
        ctx.lineWidth = pSize * 0.5;
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [createParticles]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ display: 'block' }}
    />
  );
}
