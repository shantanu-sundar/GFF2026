'use client';

/**
 * The Spark input pill: a frosted translucent capsule the merchant's question
 * types itself into before it is sent.
 *
 * On camera this is what sells it as a conversation rather than a script — you
 * see the question being written, then it lifts into the thread and the agent
 * answers. The typing is driven by LiveStage so the request only fires once the
 * line has finished writing.
 */
export default function SparkComposer({
  text,
  typing,
  busy,
  settling,
  hint,
}: {
  text: string;
  typing: boolean;
  busy: boolean;
  settling: boolean;
  hint: string;
}) {
  const showCaret = typing;
  const empty = !text;

  return (
    <div className="px-7 pt-2 pb-6">
      <div className="mx-auto w-full max-w-[680px]">
        {(busy || settling) && (
          <div className="mb-2.5 flex justify-center">
            <span className="glass lg-rise inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[var(--lg-ink-2)]">
              <span
                className="lg-pulse size-1.5 rounded-full"
                style={{ background: settling ? 'var(--lg-gold)' : 'var(--lg-evergreen)' }}
              />
              {settling ? 'Waiting for the payment to settle…' : 'Agent is working…'}
            </span>
          </div>
        )}

        <div className="pill-input flex items-center gap-3 rounded-full py-2.5 pr-2.5 pl-5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-[18px] shrink-0"
            style={{ color: 'var(--lg-ink-3)' }}
            aria-hidden
          >
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="min-w-0 flex-1 py-1 text-[16px] leading-snug">
            {empty ? (
              <span style={{ color: 'var(--lg-ink-3)' }}>{hint}</span>
            ) : (
              <span style={{ color: 'var(--lg-ink)' }}>
                {text}
                {/* Block cursor; its size and colour live in liquid.css. */}
                {showCaret && <span className="lg-caret ml-[2px]" />}
              </span>
            )}
          </div>

          <span
            className="grid size-9 shrink-0 place-items-center rounded-full transition-opacity"
            style={{
              background: empty ? 'rgba(29,34,31,0.10)' : 'var(--lg-evergreen)',
              opacity: busy ? 0.55 : 1,
            }}
          >
            {busy ? (
              <svg viewBox="0 0 24 24" fill="none" className="lg-ring size-4 text-white">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="size-4">
                <path
                  d="M12 19V5M12 5l-6 6M12 5l6 6"
                  stroke={empty ? 'rgba(29,34,31,0.45)' : '#fff'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
