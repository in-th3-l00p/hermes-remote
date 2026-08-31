import type { DemoEvent } from "./types.ts";

/** In-page fan-out of lifecycle events, mirroring the server's event bus. */
export class DemoEventBus {
  private readonly listeners = new Set<(event: DemoEvent) => void>();

  constructor(private readonly now: () => Date) {}

  publish(type: string, data: Record<string, unknown>): DemoEvent {
    const event: DemoEvent = { type, at: this.now().toISOString(), data };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(signal: AbortSignal): AsyncIterable<DemoEvent> {
    const queue: DemoEvent[] = [];
    let wake: (() => void) | null = null;
    let closed = signal.aborted;
    const listener = (event: DemoEvent): void => {
      queue.push(event);
      wake?.();
      wake = null;
    };
    if (!closed) {
      this.listeners.add(listener);
    }
    signal.addEventListener("abort", () => {
      closed = true;
      this.listeners.delete(listener);
      wake?.();
      wake = null;
    });
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<DemoEvent>> => {
          for (;;) {
            const event = queue.shift();
            if (event !== undefined) {
              return { value: event, done: false };
            }
            if (closed) {
              return { value: undefined, done: true };
            }
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        },
      }),
    };
  }
}
