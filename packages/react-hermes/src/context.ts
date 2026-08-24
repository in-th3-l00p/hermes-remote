import {
  createContext,
  createElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import type { HermesClient } from "@in-th3-l00p/hermes-web-ts";

const HermesContext = createContext<HermesClient | null>(null);

export interface HermesProviderProps {
  client: HermesClient;
  children?: ReactNode;
}

export function HermesProvider(props: HermesProviderProps): ReactElement {
  return createElement(
    HermesContext.Provider,
    { value: props.client },
    props.children,
  );
}

export function useHermesClient(): HermesClient {
  const client = useContext(HermesContext);
  if (client === null) {
    throw new Error("useHermesClient must be used within a HermesProvider");
  }
  return client;
}
