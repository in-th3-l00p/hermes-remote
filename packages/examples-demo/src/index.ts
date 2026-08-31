import { handle } from "./routes.ts";
import { DemoState } from "./state.ts";
import type { Delay } from "./types.ts";

export { DemoEventBus } from "./bus.ts";
export { chunked, pickReply, pickRunOutput } from "./replies.ts";
export {
  DEMO_VERSION,
  HOMES,
  JOBS,
  MODELS,
  PROFILE_NAMES,
  PROFILES,
  UPSTREAM_CAPABILITIES,
  UPSTREAM_HEALTH,
  renderConfig,
  seedEvents,
  seedRuns,
  seedSessions,
  type ProfileName,
} from "./seed.ts";
export { handle, KEY_SCOPES, principalFrom, type Principal } from "./routes.ts";
export { DemoState, MEMORY_LIMIT, USER_LIMIT } from "./state.ts";
export type {
  Delay,
  DemoEvent,
  DemoJob,
  DemoMessage,
  DemoProfileHome,
  DemoProfileInfo,
  DemoRun,
  DemoSession,
  DemoSessionMeta,
} from "./types.ts";

export interface DemoFetchOptions {
  /** Pause between streamed SSE frames; tests inject a zero/gated delay. */
  delay?: Delay;
  /** Clock seam; defaults to the real time. */
  now?: () => Date;
}

export const defaultDelay: Delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A drop-in `fetch` implementation backing the example apps with seeded,
 * mutable in-memory data. One call creates one isolated backend; share the
 * returned function between clients that should see the same state.
 */
export function createDemoFetch(options: DemoFetchOptions = {}): typeof fetch {
  const state = new DemoState(options.now ?? (() => new Date()));
  const delay = options.delay ?? defaultDelay;
  const demoFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    handle(state, delay, new Request(input, init));
  return demoFetch as typeof fetch;
}
