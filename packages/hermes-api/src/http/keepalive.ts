/**
 * An SSE comment: no `event:`, no `data:`, so every conformant client parses
 * it and discards it. It carries no meaning to the client at all — its only
 * job is to be a write, because a write is what tells the transport that the
 * connection is alive.
 */
export const KEEPALIVE_FRAME = ": keepalive\n\n";

/**
 * Cadence used when a caller does not choose one. Two constraints bracket it:
 * Bun's idle timer is not reliably reset by writes much below four seconds, so
 * anything under ~5s measures that floor rather than the keepalive; and it must
 * stay comfortably inside the idle timeout in force, including Bun's 10s default
 * for any embedder that builds the app without `startServer`.
 */
export const DEFAULT_KEEPALIVE_MS = 10_000;

/**
 * Calls `write` every `everyMs` until the returned stop function is called.
 * Nothing is written immediately, so a turn that finishes inside the first
 * interval emits no keepalive at all and is byte-identical to one with no
 * keepalive running.
 */
export function keepAlive(
  write: () => void,
  everyMs: number = DEFAULT_KEEPALIVE_MS,
): () => void {
  const timer = setInterval(write, everyMs);
  return () => {
    clearInterval(timer);
  };
}
