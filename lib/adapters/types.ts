import type { Framework, RunEvent } from '../events';

export interface RunTurnOptions {
  instructions: string;
  model: string;
  /** Tool names to expose. `null` = the whole catalogue. */
  toolNames: string[] | null;
  /** Opaque, framework-specific conversation history from the previous turn. */
  history: unknown[];
  prompt: string;
  emit: (event: RunEvent) => void;
}

export interface RunTurnResult {
  history: unknown[];
  finalText: string;
}

/**
 * The seam that makes the framework swap a one-constant change.
 *
 * The three Cashfree adapters are NOT drop-in compatible with each other
 * (different class names, different accessors: getAgentTools() vs getTools()
 * vs toolsMap), so this interface is where that difference is absorbed.
 * Everything above this line — scenarios, events, UI — is framework-agnostic.
 */
export interface FrameworkAdapter {
  id: Framework;
  label: string;
  /** Tool names this adapter will actually expose, for the scope panel. */
  resolveToolNames(toolNames: string[] | null): string[];
  runTurn(options: RunTurnOptions): Promise<RunTurnResult>;
}
