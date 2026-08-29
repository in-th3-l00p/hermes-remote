export interface VerifiedUser {
  sub: string;
  email?: string;
  isAnonymous?: boolean;
}

/** Anything that can turn an end-user bearer token into a verified identity. */
export interface AuthProvider {
  readonly name: string;
  verify(token: string): Promise<VerifiedUser | null>;
}

/** Injectable dynamic-import seam so optional SDKs stay optional and testable. */
export type ModuleLoader = (specifier: string) => Promise<unknown>;

export const defaultModuleLoader: ModuleLoader = (specifier) =>
  import(specifier);

export function missingDependency(provider: string, packageName: string): Error {
  return new Error(
    `auth provider "${provider}" requires the optional peer dependency ${packageName}`,
  );
}
