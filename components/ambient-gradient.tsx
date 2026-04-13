'use client';

import { useEffect, useRef } from 'react';

/**
 * Blue–violet gradient + soft radial highlight that follows the cursor.
 * No canvas; only CSS vars + one gradient layer (cheap to paint).
 */
export function AmbientGradient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setSpot = (clientX: number, clientY: number) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      el.style.setProperty('--spot-x', `${(clientX / w) * 100}%`);
      el.style.setProperty('--spot-y', `${(clientY / h) * 100}%`);
    };

    const onMove = (e: MouseEvent) => {
      if (reduced) return;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setSpot(e.clientX, e.clientY);
      });
    };

    setSpot(window.innerWidth / 2, window.innerHeight * 0.35);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="ambient-root pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[#030208]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(165deg, rgb(15 23 42) 0%, rgb(30 27 75 / 0.96) 42%, rgb(67 56 202 / 0.55) 100%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgb(59 130 246 / 0.14) 0%, transparent 42%, rgb(139 92 246 / 0.13) 100%)',
        }}
      />
      <div className="ambient-spotlight absolute inset-0" />
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
