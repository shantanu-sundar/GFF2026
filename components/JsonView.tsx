import { Fragment, type ReactNode } from 'react';

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g;

const CLS = {
  key: 'text-[#a99bff]',
  string: 'text-[#8fdcb4]',
  number: 'text-[#f0b45f]',
  boolean: 'text-[#63b9ff]',
  null: 'text-ink-3',
  punct: 'text-ink-3',
};

function colorize(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  TOKEN.lastIndex = 0;
  let match = TOKEN.exec(source);
  while (match !== null) {
    if (match.index > cursor) {
      out.push(
        <span key={`p${index++}`} className={CLS.punct}>
          {source.slice(cursor, match.index)}
        </span>,
      );
    }

    const [full, str, colon, num, bool, nul] = match;
    if (str !== undefined && colon !== undefined) {
      out.push(
        <Fragment key={`k${index++}`}>
          <span className={CLS.key}>{str}</span>
          <span className={CLS.punct}>{colon}</span>
        </Fragment>,
      );
    } else if (str !== undefined) {
      out.push(
        <span key={`s${index++}`} className={CLS.string}>
          {str}
        </span>,
      );
    } else if (num !== undefined) {
      out.push(
        <span key={`n${index++}`} className={CLS.number}>
          {num}
        </span>,
      );
    } else if (bool !== undefined) {
      out.push(
        <span key={`b${index++}`} className={CLS.boolean}>
          {bool}
        </span>,
      );
    } else if (nul !== undefined) {
      out.push(
        <span key={`z${index++}`} className={CLS.null}>
          {nul}
        </span>,
      );
    }

    cursor = match.index + full.length;
    match = TOKEN.exec(source);
  }

  if (cursor < source.length) {
    out.push(
      <span key={`p${index++}`} className={CLS.punct}>
        {source.slice(cursor)}
      </span>,
    );
  }
  return out;
}

export function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export default function JsonView({
  value,
  className = '',
}: {
  value: unknown;
  className?: string;
}) {
  const source = stringifyValue(value);
  return (
    <pre
      className={`scroll-slim overflow-x-auto font-mono text-sm leading-[1.65] whitespace-pre ${className}`}
    >
      <code>{colorize(source)}</code>
    </pre>
  );
}
