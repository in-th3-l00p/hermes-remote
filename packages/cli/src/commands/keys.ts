import { flag, flagAll, parseArgs, parseDuration } from "../args.ts";
import {
  isDangerousScope,
  isKnownScope,
  isUserGrantableScope,
  type ApiKeyRecord,
  type KeyStore,
} from "@in-th3-l00p/hermes-remote";
import { USAGE, fail, ok, type CliResult } from "../context.ts";

function describeKey(record: ApiKeyRecord): string {
  const state = record.revoked ? "revoked" : "active";
  const scopes = record.scopes.join(",") || "(none)";
  return `${record.id}  ${record.name}  ${state}  scopes=${scopes}`;
}

export async function keysCommand(
  args: string[],
  store: KeyStore,
  now: Date,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const action = parsed.positionals[0];

  if (action === "create") {
    const name = flag(parsed, "name");
    if (name === undefined) {
      return fail("keys create requires --name");
    }
    const scopes = flagAll(parsed, "scope");
    if (scopes.length === 0) {
      return fail("keys create requires at least one --scope");
    }
    const userGrantable = flagAll(parsed, "user-grantable");
    for (const scope of [...scopes, ...userGrantable]) {
      if (!isKnownScope(scope)) {
        return fail(`unknown scope: ${scope}`);
      }
    }
    const dangerous = scopes.filter(isDangerousScope);
    if (dangerous.length > 0 && flag(parsed, "dangerous") !== "true") {
      return fail(
        `dangerous scopes (${dangerous.join(", ")}) require --dangerous`,
      );
    }
    const invalidGrantable = userGrantable.filter(
      (s) => !isUserGrantableScope(s),
    );
    if (invalidGrantable.length > 0) {
      return fail(
        `--user-grantable accepts tier-1 scopes only: ${invalidGrantable.join(", ")}`,
      );
    }
    const expires = flag(parsed, "expires");
    let expiresAt: Date | undefined;
    if (expires !== undefined) {
      const ms = parseDuration(expires);
      if (ms === null) {
        return fail(`invalid --expires value: ${expires} (use e.g. 30m, 12h, 90d)`);
      }
      expiresAt = new Date(now.getTime() + ms);
    }
    const cidrs = flagAll(parsed, "cidr");
    const profile = flag(parsed, "profile");
    const { record, token } = await store.create({
      name,
      scopes,
      userGrantable,
      cidrs,
      now,
      ...(profile === undefined ? {} : { profile }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
    return ok(
      `created key ${record.id} (${record.name})\n\n  ${token}\n\nstore this token now — it cannot be shown again`,
    );
  }

  if (action === "list") {
    const keys = await store.list();
    if (keys.length === 0) {
      return ok("no API keys");
    }
    return ok(keys.map(describeKey).join("\n"));
  }

  const id = parsed.positionals[1];
  if (
    action === "show" ||
    action === "revoke" ||
    action === "rotate" ||
    action === "grant" ||
    action === "ungrant"
  ) {
    if (id === undefined) {
      return fail(`keys ${action} requires a key id`);
    }
    if (action === "show") {
      const record = await store.get(id);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(JSON.stringify({ ...record, hash: "(redacted)" }, null, 2));
    }
    if (action === "revoke") {
      const record = await store.revoke(id);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(`revoked key ${id}`);
    }
    if (action === "rotate") {
      const rotated = await store.rotate(id);
      return rotated === null
        ? fail(`no such key: ${id}`)
        : ok(
            `rotated key ${id}\n\n  ${rotated.token}\n\nstore this token now — the previous secret no longer works`,
          );
    }
    const scopes = flagAll(parsed, "scope");
    if (scopes.length === 0) {
      return fail(`keys ${action} requires at least one --scope`);
    }
    const unknown = scopes.filter((s) => !isKnownScope(s));
    if (unknown.length > 0) {
      return fail(`unknown scope: ${unknown.join(", ")}`);
    }
    if (action === "grant") {
      const dangerous = scopes.filter(isDangerousScope);
      if (dangerous.length > 0 && flag(parsed, "dangerous") !== "true") {
        return fail(
          `dangerous scopes (${dangerous.join(", ")}) require --dangerous`,
        );
      }
      const record = await store.grantScopes(id, scopes);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(describeKey(record));
    }
    const record = await store.ungrantScopes(id, scopes);
    return record === null
      ? fail(`no such key: ${id}`)
      : ok(describeKey(record));
  }

  return fail(`unknown keys action: ${action ?? "(none)"}\n\n${USAGE}`);
}
