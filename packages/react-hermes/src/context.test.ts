import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { createElement } from "react";
import { renderHook } from "@testing-library/react";
import { HermesClient } from "@intheloop-studio/hermes-remote-client";
import { HermesProvider, useHermesClient } from "./index.ts";
import type { ReactNode } from "react";

const client = new HermesClient({ baseUrl: "http://x", token: "t" });

describe("useHermesClient", () => {
  test("returns the client from the provider", () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(HermesProvider, { client }, children);
    const { result } = renderHook(() => useHermesClient(), { wrapper });
    expect(result.current).toBe(client);
  });

  test("throws outside a provider", () => {
    expect(() => renderHook(() => useHermesClient())).toThrow(
      "useHermesClient must be used within a HermesProvider",
    );
  });
});
