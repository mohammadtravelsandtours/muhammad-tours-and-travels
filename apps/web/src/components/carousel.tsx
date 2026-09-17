'use client';

import { ReactNode, useEffect, useState } from 'react';

/**
 * A minimal, dependency-free auto-advancing carousel — one slide (which
 * can itself contain a row of several cards) visible at a time, sliding
 * via a translateX transform. Pauses on hover/focus so it never fights a
 * visitor trying to read or click a slide, and always offers manual
 * prev/next + dot controls, never relying on auto-play alone.
 */
export function Carousel({
  slides,
  intervalMs = 5000,
  ariaLabel,
}: {
  slides: ReactNode[];
  intervalMs?: number;
  ariaLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [paused, count, intervalMs]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-2xl">
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0" aria-hidden={i !== index}>
              {slide}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border border-sand shadow-sm flex items-center justify-center text-dusk-700 hover:text-dusk-900"
          >
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border border-sand shadow-sm flex items-center justify-center text-dusk-700 hover:text-dusk-900"
          >
            <span aria-hidden>›</span>
          </button>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-tangerine' : 'w-1.5 bg-sand'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
