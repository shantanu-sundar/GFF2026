import type { Framework } from '../events';
import type { FrameworkAdapter } from './types';
import { openaiAdapter } from './openai';

/**
 * The framework swap. On camera this is the single constant that changes:
 * the scenario, the tools, the prompts and the UI are all identical across
 * the three, because each adapter absorbs its own SDK's shape.
 */
const registry: Partial<Record<Framework, FrameworkAdapter>> = {
  openai: openaiAdapter,
};

/**
 * Lazily imported so selecting the OpenAI adapter never pulls the LangChain or
 * AI SDK packages into the process. Note this does NOT make them optional at
 * build time — Turbopack resolves these specifiers statically, so all three
 * modules must exist or every route fails to compile.
 */
export async function getAdapter(framework: Framework): Promise<FrameworkAdapter> {
  if (registry[framework]) return registry[framework]!;

  if (framework === 'langchain') {
    const m = await import('./langchain');
    return (registry.langchain = m.langchainAdapter);
  }
  if (framework === 'ai-sdk') {
    const m = await import('./ai-sdk');
    return (registry['ai-sdk'] = m.aiSdkAdapter);
  }
  throw new Error(`Unknown framework: ${framework}`);
}

export const FRAMEWORKS: Framework[] = ['openai', 'langchain', 'ai-sdk'];
