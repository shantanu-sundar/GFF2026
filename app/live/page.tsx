import './liquid.css';
import LiveStage from '@/components/LiveStage';
import { SCENARIOS } from '@/lib/scenarios';
import type { Framework, ScenarioId } from '@/lib/events';

export const metadata = { title: 'Merchant Support Agent — live' };

const FRAMEWORKS: Framework[] = ['openai', 'langchain', 'ai-sdk'];

/**
 * /live — the stripped stage used for recording.
 *
 *   /live                       the money lifecycle, live sandbox
 *   /live?scenario=scoped       the read-only agent
 *   /live?scenario=reconciliation
 *   /live?framework=langchain   same beat, different SDK (the swap shot)
 *   /live?mock=1                scripted replay, no API calls (rehearsal / fallback)
 *   /live?chrome=0             hide the top strip entirely
 *   /live?auto=1               advance turns on their own
 *   /live?settle=0             wait out the real ~20-32s sandbox timer instead
 *                              of settling the payment at the 8s mark
 *
 * The full console with all its controls stays at /.
 */
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const requested = one('scenario');
  const scenario: ScenarioId =
    requested && requested in SCENARIOS ? (requested as ScenarioId) : 'lifecycle';

  const requestedFramework = one('framework') as Framework | undefined;
  const framework: Framework =
    requestedFramework && FRAMEWORKS.includes(requestedFramework)
      ? requestedFramework
      : 'openai';

  return (
    <LiveStage
      scenario={scenario}
      framework={framework}
      mock={one('mock') === '1'}
      chrome={one('chrome') !== '0'}
      auto={one('auto') === '1'}
      showTools={one('tools') !== '0'}
      settleAfterMs={(() => {
        const raw = one('settle');
        if (raw === undefined) return 9000;
        const seconds = Number(raw);
        return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 8000;
      })()}
    />
  );
}
