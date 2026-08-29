import { ClerkAuthProvider } from "./clerk.ts";
import { JwtAuthProvider } from "./jwt.ts";
import { SupabaseAuthProvider } from "./supabase.ts";
import type { AuthProvider, ModuleLoader } from "./types.ts";

export type AuthProviderConfig =
  | { provider: "supabase"; url: string; publishableKey: string }
  | {
      provider: "clerk";
      secretKey?: string;
      jwtKey?: string;
      audience?: string;
      authorizedParties?: string[];
    }
  | {
      provider: "jwt";
      jwksUrl?: string;
      hs256Secret?: string;
      issuer?: string;
      audience?: string;
    }
  | { provider: "none" };

export function createAuthProvider(
  config: AuthProviderConfig,
  loadModule?: ModuleLoader,
): AuthProvider | null {
  switch (config.provider) {
    case "supabase":
      return new SupabaseAuthProvider({
        url: config.url,
        publishableKey: config.publishableKey,
        ...(loadModule === undefined ? {} : { loadModule }),
      });
    case "clerk": {
      const { provider, ...options } = config;
      void provider;
      return new ClerkAuthProvider({
        ...options,
        ...(loadModule === undefined ? {} : { loadModule }),
      });
    }
    case "jwt": {
      const { provider, ...options } = config;
      void provider;
      return new JwtAuthProvider(options);
    }
    case "none":
      return null;
  }
}
