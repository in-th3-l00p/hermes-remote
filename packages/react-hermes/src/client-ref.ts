import { useRef } from "react";

/**
 * What effects key on for a client: its base URL when it has one, so a
 * client constructed inline on every render doesn't restart effects.
 */
export function clientKey(client: unknown): unknown {
  const baseUrl = (client as { baseUrl?: unknown } | null)?.baseUrl;
  return typeof baseUrl === "string" ? baseUrl : client;
}

/** A ref that always holds the latest value (latest client, fetcher, ...). */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
