'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';

type VortexState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VortexProps {
  state: VortexState;
  className?: string;
}

// Target values per state — we lerp toward these each frame
const STATE_CONFIG = {
  idle: {
    speed: 0.3,
    spread: 1.0,
    color: new THREE.Color('#00d4ff'),
    coreIntensity: 0.5,
    pulseRate: 0.008,
    particleCount: 220,
    inward: false,
    waveAmplitude: 0.0,
  },
  listening: {
    speed: 0.9,
    spread: 1.35,
    color: new THREE.Color('#ff7832'),
    coreIntensity: 0.8,
    pulseRate: 0.018,
    particleCount: 220,
    inward: false,
    waveAmplitude: 0.0,
  },
  thinking: {
    speed: 1.6,
    spread: 0.75,
    color: new THREE.Color('#00d4ff'),
    coreIntensity: 1.0,
    pulseRate: 0.03,
    particleCount: 220,
    inward: true,
    waveAmplitude: 0.0,
  },
  speaking: {
    speed: 0.55,
    spread: 1.15,
    color: new THREE.Color('#f59e0b'),
    coreIntensity: 0.7,
    pulseRate: 0.012,
    particleCount: 220,
    inward: false,
    waveAmplitude: 1.0,
  },
};

// Vertex shader — particles spiral around the Y axis
const PARTICLE_VERT = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aLayer;
  attribute float aPhase;
  attribute float aBaseY;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uSpread;
  uniform float uInward;
  uniform float uPulse;
  uniform vec3  uColor;

  varying float vOpacity;
  varying vec3  vColor;

  void main() {
    // Layer multiplier — layers rotate at different speeds/directions
    float dir = aLayer < 1.0 ? 1.0 : aLayer < 2.0 ? -0.65 : 0.45;
    float layerSpeed = uSpeed * dir * (0.6 + aLayer * 0.25);

    float angle = aAngle + uTime * layerSpeed;

    // Thinking state: slowly pull particles inward along radius
    float r = aRadius * uSpread;
    float inwardPull = uInward * mod(uTime * 0.12 + aPhase, 1.0);
    r = r * (1.0 - inwardPull * 0.65);
    r = max(r, 0.04);

    // Vertical oscillation creates tornado shape
    float heightFactor = 1.0 - (aRadius / 2.2);
    float yOscillation = sin(uTime * 1.2 * uSpeed * dir + aPhase) * 0.06;
    float y = aBaseY * heightFactor * uSpread + yOscillation;

    float x = cos(angle) * r;
    float z = sin(angle) * r;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size: larger for inner particles, pulsing
    float sizeFactor = (1.0 - aRadius / 2.2) * 0.5 + 0.5;
    gl_PointSize = (3.5 + sizeFactor * 4.0) * uPulse * (300.0 / -mvPosition.z);

    // Opacity fades at extremes
    vOpacity = (0.3 + sizeFactor * 0.5) * uPulse;
    vColor = uColor;
  }
`;

// Fragment shader — soft round points with trails baked via alpha
const PARTICLE_FRAG = /* glsl */ `
  varying float vOpacity;
  varying vec3  vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = (1.0 - d * 2.0) * vOpacity;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// Core glow orb shaders
const CORE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform float uPulse;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    // Soft radial glow
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 2.5) * uPulse;
    float inner = pow(core, 6.0) * uPulse * 1.5;
    vec3 color = mix(uColor, vec3(1.0), inner);
    gl_FragColor = vec4(color, glow * 0.9);
  }
`;

// Wave ring shaders (speaking state)
const WAVE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WAVE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  uniform float uPhase;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    float ring = mod(d * 5.0 - uTime * 1.4 + uPhase, 1.0);
    float a = (1.0 - smoothstep(0.0, 0.15, ring)) * (1.0 - smoothstep(0.3, 0.5, d));
    gl_FragColor = vec4(uColor, a * uWave * 0.6);
  }
`;

export default function Vortex({ state, className = '' }: VortexProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<VortexState>(state);
  stateRef.current = state;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene setup ────────────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
    camera.position.set(0, 0, 2.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── Particles ──────────────────────────────────────────────────
    const PARTICLE_COUNT = 220;
    const angles   = new Float32Array(PARTICLE_COUNT);
    const radii    = new Float32Array(PARTICLE_COUNT);
    const layers   = new Float32Array(PARTICLE_COUNT);
    const phases   = new Float32Array(PARTICLE_COUNT);
    const baseYs   = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      angles[i]  = Math.random() * Math.PI * 2;
      // More particles near center (tornado taper)
      radii[i]   = 0.08 + Math.pow(Math.random(), 1.4) * 2.0;
      layers[i]  = Math.floor(Math.random() * 3);
      phases[i]  = Math.random() * Math.PI * 2;
      baseYs[i]  = (Math.random() - 0.5) * 1.6;
    }

    const pGeo = new THREE.BufferGeometry();
    // positions are computed in shader; we need a dummy position attribute
    const dummyPos = new Float32Array(PARTICLE_COUNT * 3); // all zeros
    pGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
    pGeo.setAttribute('aAngle',   new THREE.BufferAttribute(angles,  1));
    pGeo.setAttribute('aRadius',  new THREE.BufferAttribute(radii,   1));
    pGeo.setAttribute('aLayer',   new THREE.BufferAttribute(layers,  1));
    pGeo.setAttribute('aPhase',   new THREE.BufferAttribute(phases,  1));
    pGeo.setAttribute('aBaseY',   new THREE.BufferAttribute(baseYs,  1));

    const pMat = new THREE.ShaderMaterial({
      vertexShader:   PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime:   { value: 0 },
        uSpeed:  { value: STATE_CONFIG.idle.speed },
        uSpread: { value: STATE_CONFIG.idle.spread },
        uInward: { value: 0 },
        uPulse:  { value: 1 },
        uColor:  { value: STATE_CONFIG.idle.color.clone() },
      },
    });

    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── Orbital rings ──────────────────────────────────────────────
    const rings: THREE.LineLoop[] = [];
    const ringRadii = [0.42, 0.72, 1.05];
    for (const rr of ringRadii) {
      const ringGeo = new THREE.RingGeometry(rr, rr + 0.003, 96);
      // LineLoop needs a circle path
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 128; j++) {
        const a = (j / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: STATE_CONFIG.idle.color.clone(),
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.LineLoop(lineGeo, lineMat);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      scene.add(ring);
      rings.push(ring);
      ringGeo.dispose();
    }

    // ── Core glow orb ──────────────────────────────────────────────
    const coreGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const coreMat = new THREE.ShaderMaterial({
      vertexShader:   CORE_VERT,
      fragmentShader: CORE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uPulse: { value: 1 },
        uColor: { value: STATE_CONFIG.idle.color.clone() },
      },
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // ── Wave planes (speaking) ─────────────────────────────────────
    const waveCount = 3;
    const waves: THREE.Mesh[] = [];
    for (let w = 0; w < waveCount; w++) {
      const wGeo = new THREE.PlaneGeometry(3.5, 3.5);
      const wMat = new THREE.ShaderMaterial({
        vertexShader:   WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime:  { value: 0 },
          uWave:  { value: 0 },
          uPhase: { value: w * (Math.PI * 2 / waveCount) },
          uColor: { value: STATE_CONFIG.speaking.color.clone() },
        },
      });
      const wave = new THREE.Mesh(wGeo, wMat);
      scene.add(wave);
      waves.push(wave);
    }

    // ── Lerp helpers ───────────────────────────────────────────────
    let lerpSpeed   = STATE_CONFIG.idle.speed;
    let lerpSpread  = STATE_CONFIG.idle.spread;
    let lerpInward  = 0;
    let lerpPulse   = 1;
    let lerpWave    = 0;
    const lerpColor = STATE_CONFIG.idle.color.clone();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const T = 0.025; // lerp factor per frame (~60fps feels smooth)

    // ── Animation loop ─────────────────────────────────────────────
    let rafId: number;
    let time = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);

      const cfg = STATE_CONFIG[stateRef.current];
      time += 0.016;

      // Lerp all values toward target
      lerpSpeed  = lerp(lerpSpeed,  cfg.speed,         T);
      lerpSpread = lerp(lerpSpread, cfg.spread,         T);
      lerpInward = lerp(lerpInward, cfg.inward ? 1 : 0, T);
      lerpWave   = lerp(lerpWave,   cfg.waveAmplitude,  T);
      lerpColor.lerp(cfg.color, T);

      const pulse = Math.sin(time * cfg.pulseRate * 60) * 0.15 + 0.85;
      lerpPulse   = lerp(lerpPulse, pulse, 0.08);

      // Update particle uniforms
      pMat.uniforms.uTime.value   = time;
      pMat.uniforms.uSpeed.value  = lerpSpeed;
      pMat.uniforms.uSpread.value = lerpSpread;
      pMat.uniforms.uInward.value = lerpInward;
      pMat.uniforms.uPulse.value  = lerpPulse;
      pMat.uniforms.uColor.value.copy(lerpColor);

      // Rotate rings at slightly different rates per ring
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const mat = ring.material as THREE.LineBasicMaterial;
        ring.rotation.y += lerpSpeed * 0.003 * (i % 2 === 0 ? 1 : -0.7);
        ring.rotation.z += lerpSpeed * 0.001 * (i % 2 === 0 ? -0.5 : 0.4);
        mat.color.copy(lerpColor);
        mat.opacity = 0.07 + lerpPulse * 0.08;
      }

      // Core orb faces camera (billboard)
      core.quaternion.copy(camera.quaternion);
      coreMat.uniforms.uPulse.value = lerpPulse * cfg.coreIntensity;
      coreMat.uniforms.uColor.value.copy(lerpColor);

      // Wave planes (always face camera)
      for (const wave of waves) {
        const wMat = wave.material as THREE.ShaderMaterial;
        wave.quaternion.copy(camera.quaternion);
        wMat.uniforms.uTime.value  = time;
        wMat.uniforms.uWave.value  = lerpWave;
        wMat.uniforms.uColor.value.copy(lerpColor);
      }

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();

      pGeo.dispose();
      pMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();

      for (const ring of rings) {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      }
      for (const wave of waves) {
        wave.geometry.dispose();
        (wave.material as THREE.Material).dispose();
      }

      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []); // run once; state changes are handled via stateRef

  return (
    <div
      ref={mountRef}
      className={`w-full h-full ${className}`}
      style={{ display: 'block' }}
    />
  );
}
