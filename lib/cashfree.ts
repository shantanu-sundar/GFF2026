import { CashfreeAgentToolkit, CFEnvironment } from '@cashfreepayments/agent-toolkit/openai';

/**
 * One toolkit instance per process. Constructing it is cheap but it also runs
 * the package's update check, so we don't want one per request.
 */
let cached: CashfreeAgentToolkit | null = null;

export function getToolkit(): CashfreeAgentToolkit {
  if (cached) return cached;

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET missing. Copy .env.example to .env.local.',
    );
  }

  const environment =
    process.env.CASHFREE_ENV === 'PRODUCTION'
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;

  cached = new CashfreeAgentToolkit(environment, clientId, clientSecret);
  return cached;
}

/** Every tool the toolkit ships — 40 at v1.1.0 (22 payment gateway + 18 verification). */
export function toolCatalogSize(): number {
  return getToolkit().getAgentTools().length;
}

/**
 * Hand back only the named tools. This is the entire scoping mechanism: the
 * agent is constructed with this array and simply never sees anything else.
 * There is no allow-list middleware to bypass.
 */
export function selectTools(names: string[] | null) {
  const tk = getToolkit();
  if (names === null) return tk.getAgentTools();

  return names.map((name) => {
    const t = tk.tools[name as keyof typeof tk.tools];
    if (!t) throw new Error(`Unknown Cashfree tool: ${name}`);
    return t;
  });
}
