'use client';

import { useEffect, useRef, useState } from 'react';
import { formatINR, statusTone, type StatusTone } from '@/lib/format';

/* ------------------------------------------------------------------ */
/* Status pill — flashes when the status actually changes.              */
/* ------------------------------------------------------------------ */

const TONE: Record<StatusTone, { pill: string; dot: string; tint: string }> = {
  good: {
    pill: 'text-good border-good/35 bg-good/12',
    dot: 'bg-good',
    tint: 'rgba(61, 220, 151, 0.45)',
  },
  live: {
    pill: 'text-info border-info/35 bg-info/12',
    dot: 'bg-info',
    tint: 'rgba(88, 182, 255, 0.45)',
  },
  pending: {
    pill: 'text-warn border-warn/35 bg-warn/12',
    dot: 'bg-warn',
    tint: 'rgba(245, 181, 68, 0.45)',
  },
  bad: {
    pill: 'text-bad border-bad/35 bg-bad/12',
    dot: 'bg-bad',
    tint: 'rgba(255, 107, 112, 0.45)',
  },
  neutral: {
    pill: 'text-ink-2 border-line-2 bg-white/5',
    dot: 'bg-ink-3',
    tint: 'rgba(255, 255, 255, 0.2)',
  },
};

export function StatusPill({
  status,
  revision = 0,
  pulse = false,
}: {
  status: string;
  /** Bump to replay the flash. */
  revision?: number;
  pulse?: boolean;
}) {
  const tone = TONE[statusTone(status)];
  const [flash, setFlash] = useState(false);
  const seen = useRef(revision);

  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 760);
    return () => clearTimeout(timer);
  }, [revision]);

  return (
    <span
      style={{ '--flash-tint': tone.tint } as React.CSSProperties}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-xs font-medium tracking-[0.06em] whitespace-nowrap ${tone.pill} ${
        flash ? 'status-flash' : ''
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${tone.dot} ${pulse ? 'breathe' : ''}`}
      />
      {status.toUpperCase()}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header chip                                                          */
/* ------------------------------------------------------------------ */

export function Chip({
  children,
  onClick,
  active = false,
  title,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs whitespace-nowrap transition-colors duration-150';
  const look = active
    ? 'border-accent/50 bg-accent/15 text-ink'
    : 'border-line bg-white/[0.03] text-ink-2';
  const interactive = onClick
    ? 'cursor-pointer hover:border-line-2 hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
    : '';

  if (!onClick) {
    return (
      <span title={title} className={`${base} ${look} ${className}`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`${base} ${look} ${interactive} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Amount that counts to its new value instead of snapping.             */
/* ------------------------------------------------------------------ */

export function AnimatedAmount({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  // Starts at zero so a freshly created entity counts up into place.
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) {
      setShown(value);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const duration = 300;
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) {
        frame = requestAnimationFrame(step);
      } else {
        from.current = value;
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{formatINR(Math.round(shown))}</span>;
}

/* ------------------------------------------------------------------ */
/* Small caps section label                                             */
/* ------------------------------------------------------------------ */

export function Eyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-xs font-medium tracking-[0.14em] text-ink-3 uppercase ${className}`}
    >
      {children}
    </span>
  );
}
