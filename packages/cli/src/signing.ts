import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newSigningSecret } from "@intheloop-studio/hermes-remote";

/**
 * The secret that signs user tokens minted by token exchange. Created on
 * first use in the hermes-remote home, owner-only; deleting the file (and
 * restarting) invalidates every outstanding user token.
 */
export async function loadSigningSecret(homeDir: string): Promise<string> {
  const path = join(homeDir, "signing.key");
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing !== null && existing.trim().length >= 32) {
    return existing.trim();
  }
  await mkdir(homeDir, { recursive: true, mode: 0o700 });
  const secret = newSigningSecret();
  await writeFile(path, `${secret}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return secret;
}
