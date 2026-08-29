export interface HermesEvent {
  type: string;
  at: string;
  data: unknown;
}

/** In-process fan-out of lifecycle events observed by hermes-remote. */
export class EventBus {
  private readonly listeners = new Set<(event: HermesEvent) => void>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  publish(type: string, data: unknown): HermesEvent {
    const event: HermesEvent = { type, at: this.now().toISOString(), data };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(signal?: AbortSignal): AsyncIterable<HermesEvent> {
    const queue: HermesEvent[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    const listener = (event: HermesEvent): void => {
      queue.push(event);
      wake?.();
      wake = null;
    };
    this.listeners.add(listener);
    const close = (): void => {
      closed = true;
      this.listeners.delete(listener);
      wake?.();
      wake = null;
    };
    signal?.addEventListener("abort", close);
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<HermesEvent>> => {
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
        return: async (): Promise<IteratorResult<HermesEvent>> => {
          close();
          return { value: undefined, done: true };
        },
      }),
    };
  }
}
