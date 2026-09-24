const COMMENT = new TextEncoder().encode(": keepalive\n\n");

/** Default interval between keepalive comments on quiet SSE streams. */
export const KEEPALIVE_MS = 15_000;

/** True when the stream so far ends with a blank line (LF or CRLF). */
function endsFrame(tail: number[]): boolean {
  const lf = tail.at(-1) === 10 && tail.at(-2) === 10;
  const crlf = tail.at(-1) === 10 && tail.at(-2) === 13 && tail.at(-3) === 10 && tail.at(-4) === 13;
  return lf || crlf;
}

/**
 * Passes an SSE byte stream through, adding a `: keepalive` comment
 * whenever it has been quiet for `intervalMs`. Comments are only inserted
 * at a frame boundary (after a blank line), so a frame split across chunks
 * is never interrupted. Cancelling the result cancels the source.
 */
export function keepAlive(
  source: ReadableStream<Uint8Array>,
  intervalMs = KEEPALIVE_MS,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  let atBoundary = true;
  let tail: number[] = [];
  let lastWrite = Date.now();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(
        () => {
          if (atBoundary && Date.now() - lastWrite >= intervalMs) {
            controller.enqueue(COMMENT);
            lastWrite = Date.now();
          }
        },
        Math.max(1, Math.floor(intervalMs / 2)),
      );
    },
    async pull(controller) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        clearInterval(timer);
        throw cause;
      }
      const { done, value } = chunk;
      if (done) {
        clearInterval(timer);
        controller.close();
        return;
      }
      controller.enqueue(value);
      lastWrite = Date.now();
      tail = [...tail, ...value.slice(-4)].slice(-4);
      atBoundary = endsFrame(tail);
    },
    async cancel(reason) {
      clearInterval(timer);
      await reader.cancel(reason);
    },
  });
}
