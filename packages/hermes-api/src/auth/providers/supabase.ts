import {
  defaultModuleLoader,
  missingDependency,
  type AuthProvider,
  type ModuleLoader,
  type VerifiedUser,
} from "./types.ts";

export interface SupabaseProviderOptions {
  url: string;
  publishableKey: string;
  loadModule?: ModuleLoader;
}

interface SupabaseAuthClient {
  auth: {
    getClaims(token: string): Promise<{
      data: { claims: Record<string, unknown> } | null;
      error: unknown;
    }>;
  };
}

interface SupabaseModule {
  createClient(
    url: string,
    key: string,
    options: { auth: { persistSession: boolean; autoRefreshToken: boolean } },
  ): SupabaseAuthClient;
}

/** Verifies Supabase access tokens through the official SDK's getClaims. */
export class SupabaseAuthProvider implements AuthProvider {
  readonly name = "supabase";
  private readonly options: SupabaseProviderOptions;
  private readonly loadModule: ModuleLoader;
  private client: Promise<SupabaseAuthClient> | null = null;

  constructor(options: SupabaseProviderOptions) {
    this.options = options;
    this.loadModule = options.loadModule ?? defaultModuleLoader;
  }

  async verify(token: string): Promise<VerifiedUser | null> {
    const client = await (this.client ??= this.createClient());
    const result = await client.auth.getClaims(token).catch(() => null);
    if (result === null || result.error !== null || result.data === null) {
      return null;
    }
    const claims = result.data.claims;
    if (typeof claims["sub"] !== "string" || claims["sub"] === "") {
      return null;
    }
    return {
      sub: claims["sub"],
      ...(typeof claims["email"] === "string" && claims["email"] !== ""
        ? { email: claims["email"] }
        : {}),
      ...(typeof claims["is_anonymous"] === "boolean"
        ? { isAnonymous: claims["is_anonymous"] }
        : {}),
    };
  }

  private async createClient(): Promise<SupabaseAuthClient> {
    const sdk = (await this.loadModule("@supabase/supabase-js").catch(() => {
      throw missingDependency("supabase", "@supabase/supabase-js");
    })) as SupabaseModule;
    return sdk.createClient(this.options.url, this.options.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
}
