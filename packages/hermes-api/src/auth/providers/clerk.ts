import {
  defaultModuleLoader,
  missingDependency,
  type AuthProvider,
  type ModuleLoader,
  type VerifiedUser,
} from "./types.ts";

export interface ClerkProviderOptions {
  secretKey?: string;
  jwtKey?: string;
  audience?: string;
  authorizedParties?: string[];
  loadModule?: ModuleLoader;
}

interface ClerkModule {
  verifyToken(
    token: string,
    options: {
      secretKey?: string;
      jwtKey?: string;
      audience?: string;
      authorizedParties?: string[];
    },
  ): Promise<Record<string, unknown>>;
}

/** Verifies Clerk session tokens through the official backend SDK. */
export class ClerkAuthProvider implements AuthProvider {
  readonly name = "clerk";
  private readonly options: ClerkProviderOptions;
  private readonly loadModule: ModuleLoader;
  private sdk: Promise<ClerkModule> | null = null;

  constructor(options: ClerkProviderOptions) {
    if (options.secretKey === undefined && options.jwtKey === undefined) {
      throw new Error("clerk auth provider requires secretKey or jwtKey");
    }
    this.options = options;
    this.loadModule = options.loadModule ?? defaultModuleLoader;
  }

  async verify(token: string): Promise<VerifiedUser | null> {
    const sdk = await (this.sdk ??= this.loadSdk());
    const claims = await sdk
      .verifyToken(token, {
        ...(this.options.secretKey === undefined
          ? {}
          : { secretKey: this.options.secretKey }),
        ...(this.options.jwtKey === undefined
          ? {}
          : { jwtKey: this.options.jwtKey }),
        ...(this.options.audience === undefined
          ? {}
          : { audience: this.options.audience }),
        ...(this.options.authorizedParties === undefined
          ? {}
          : { authorizedParties: this.options.authorizedParties }),
      })
      .catch(() => null);
    if (claims === null || typeof claims["sub"] !== "string" || claims["sub"] === "") {
      return null;
    }
    return {
      sub: claims["sub"],
      ...(typeof claims["email"] === "string" && claims["email"] !== ""
        ? { email: claims["email"] }
        : {}),
    };
  }

  private async loadSdk(): Promise<ClerkModule> {
    return (await this.loadModule("@clerk/backend").catch(() => {
      throw missingDependency("clerk", "@clerk/backend");
    })) as ClerkModule;
  }
}
