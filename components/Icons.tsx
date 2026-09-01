/**
 * Hand-rolled inline SVG icon set. No icon library, no emoji.
 * Everything is 16x16 on a 16 grid, 1.5 stroke, currentColor.
 */

interface IconProps {
  className?: string;
}

const S = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M3 8.5 6.3 12 13 4.5" />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M5.5 3.5 10.5 8l-5 4.5" />
    </svg>
  );
}

export function IconSlash({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M4.2 11.8 11.8 4.2" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M8 2.6 14.4 13.4H1.6z" />
      <path d="M8 6.6v3.1" />
      <path d="M8 11.7h.01" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg
      {...S}
      className={className}
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M5 3.6a.6.6 0 0 1 .92-.5l6.1 3.9a.6.6 0 0 1 0 1L5.92 12.9a.6.6 0 0 1-.92-.5z" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <svg
      {...S}
      className={className}
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="8" height="8" rx="1.6" />
    </svg>
  );
}

export function IconRotate({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
      <path d="M13.4 2.4v3.1h-3.1" />
    </svg>
  );
}

export function IconGrid({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <rect x="2.2" y="2.2" width="4.6" height="4.6" rx="1.2" />
      <rect x="9.2" y="2.2" width="4.6" height="4.6" rx="1.2" />
      <rect x="2.2" y="9.2" width="4.6" height="4.6" rx="1.2" />
      <rect x="9.2" y="9.2" width="4.6" height="4.6" rx="1.2" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <circle cx="8" cy="5.6" r="2.6" />
      <path d="M2.9 13.4a5.3 5.3 0 0 1 10.2 0" />
    </svg>
  );
}

export function IconReceipt({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M3.4 2.2h9.2v11.6l-2.3-1.3-2.3 1.3-2.3-1.3-2.3 1.3z" />
      <path d="M6 5.6h4M6 8.4h4" />
    </svg>
  );
}

export function IconCard({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.8" />
      <path d="M1.8 6.7h12.4" />
      <path d="M4.4 10.1h2.4" />
    </svg>
  );
}

export function IconReturn({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M5.6 3.2 2.4 6.4l3.2 3.2" />
      <path d="M2.4 6.4h7a4.2 4.2 0 0 1 0 8.4H5.2" />
    </svg>
  );
}

export function IconTerminal({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M3.4 4.6 6.6 8l-3.2 3.4" />
      <path d="M8.4 11.4h4.2" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.8" />
      <path d="M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <path d="M2.8 8h10.4" />
      <path d="M9.4 4.2 13.2 8l-3.8 3.8" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg {...S} className={className} aria-hidden="true">
      <rect x="5.6" y="5.6" width="8" height="8" rx="1.6" />
      <path d="M10.4 5.6V4a1.6 1.6 0 0 0-1.6-1.6H4a1.6 1.6 0 0 0-1.6 1.6v4.8A1.6 1.6 0 0 0 4 10.4h1.6" />
    </svg>
  );
}

/** Indeterminate ring for a tool that is still in flight. */
export function IconSpinner({ className }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.7" />
      <path
        d="M8 2.4a5.6 5.6 0 0 1 5.6 5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The product mark: three nodes, one path — an agent walking a graph. */
export function ProductMark({ className }: IconProps) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="30" height="30" rx="9" fill="url(#mark-bg)" />
      <rect
        x="0.6"
        y="0.6"
        width="28.8"
        height="28.8"
        rx="8.4"
        stroke="white"
        strokeOpacity="0.16"
      />
      <path
        d="M8.5 20.5 13 12.2l4.2 5.2 4.3-7.9"
        stroke="white"
        strokeOpacity="0.92"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.5" cy="9.5" r="2.4" fill="white" />
      <defs>
        <linearGradient id="mark-bg" x1="0" y1="0" x2="30" y2="30">
          <stop stopColor="#8b7bff" />
          <stop offset="1" stopColor="#5b45d6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
