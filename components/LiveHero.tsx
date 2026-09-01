'use client';

/**
 * The home state, shown before the first question.
 *
 * A nod to the retro Cashfree Payments lockup — the two-tone green/amber split
 * and the blocky, tightly-tracked weight — rebuilt in the liquid-glass theme
 * rather than copied: no pixel outlines, no dark ground, just the wordmark
 * sitting in the same light the rest of the screen is made of.
 *
 * It dissolves (blur + lift) the moment the first question is sent, so the
 * conversation replaces it instead of cutting to it.
 */
export default function LiveHero({
  leaving,
  scenarioTitle,
  toolCount,
}: {
  leaving: boolean;
  scenarioTitle: string;
  toolCount: number;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center ${
        leaving ? 'hero-out' : 'hero-in'
      }`}
    >
      <div
        className="text-[13px] font-semibold tracking-[0.22em] uppercase"
        style={{ color: 'var(--lg-ink-3)' }}
      >
        Agent Toolkit
      </div>

      <h1 className="mt-4 leading-[0.86] font-extrabold tracking-[-0.045em]">
        <span
          className="block text-[clamp(44px,7vw,86px)]"
          style={{ color: 'var(--lg-evergreen)' }}
        >
          Cashfree
        </span>
        <span
          className="block text-[clamp(44px,7vw,86px)]"
          style={{ color: '#e59200' }}
        >
          Payments
        </span>
      </h1>

      <p
        className="mt-6 max-w-[430px] text-[16px] leading-relaxed"
        style={{ color: 'var(--lg-ink-2)' }}
      >
        A merchant support agent with {toolCount} live payment tools. It creates
        customers, takes money, checks status and issues refunds — on your real
        account.
      </p>

      <div
        className="mt-7 flex items-center gap-2.5 rounded-full px-4 py-2 font-mono text-[13px] glass"
        style={{ color: 'var(--lg-ink-2)' }}
      >
        <span>{scenarioTitle}</span>
        <span style={{ color: 'var(--lg-ink-3)' }}>·</span>
        <span>press space</span>
        <span className="lg-caret" />
      </div>
    </div>
  );
}
