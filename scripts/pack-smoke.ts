// Packs the four packages and proves they work as published:
// the CLI and server library under Bun, the client and React hooks under
// Node (ESM) with their types, from tarballs, not the workspace.
import { $ } from "bun";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const work = mkdtempSync(join(tmpdir(), "hermes-pack-"));
const packs = join(work, "packs");
const app = join(work, "app");
await $`mkdir -p ${packs} ${app}`;

await $`bun run --cwd ${root}/packages/hermes-ts build`.quiet();
await $`bun run --cwd ${root}/packages/react-hermes build`.quiet();
for (const pkg of ["hermes-api", "cli", "hermes-ts", "react-hermes"]) {
  await $`npm pack --silent --pack-destination ${packs}`.cwd(join(root, "packages", pkg)).quiet();
}
/** npm pack names a tarball <scope>-<name>-<version>.tgz. */
const tarball = async (pkg: string): Promise<string> => {
  const { name, version } = (await Bun.file(join(root, "packages", pkg, "package.json")).json()) as {
    name: string;
    version: string;
  };
  return `file:${join(packs, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`)}`;
};
const deps = {
  "@intheloop-studio/hermes-remote": await tarball("hermes-api"),
  "@intheloop-studio/hermes-remote-cli": await tarball("cli"),
  "@intheloop-studio/hermes-remote-client": await tarball("hermes-ts"),
  "@intheloop-studio/hermes-remote-react": await tarball("react-hermes"),
};
writeFileSync(
  join(app, "package.json"),
  JSON.stringify({ name: "pack-smoke", private: true, type: "module", dependencies: { ...deps, react: "^19.0.0", "@types/react": "^19.0.0", typescript: "^5.7.0" }, overrides: deps }, null, 2),
);
await $`bun install`.cwd(app).quiet();

const step = async (name: string, run: () => Promise<unknown>) => {
  await run();
  console.log(`ok   ${name}`);
};

await step("cli runs under bun", async () => {
  const out = await $`bun node_modules/@intheloop-studio/hermes-remote-cli/src/cli.ts help`.cwd(app).text();
  if (!out.includes("hermes-remote <command>")) throw new Error(out);
});
await step("server library imports under bun", async () => {
  const out = await $`bun -e ${'import { createApp, VERSION } from "@intheloop-studio/hermes-remote"; const r = await createApp().fetch(new Request("http://x/v1/status")); console.log(VERSION, r.status)'}`.cwd(app).text();
  if (!out.trim().endsWith("200")) throw new Error(out);
});
await step("client and react import under bun (the \"bun\" export condition)", async () => {
  const out = await $`bun -e ${'const c = await import("@intheloop-studio/hermes-remote-client"); const r = await import("@intheloop-studio/hermes-remote-react"); console.log(typeof c.HermesClient, typeof r.useChat)'}`.cwd(app).text();
  if (out.trim() !== "function function") throw new Error(out);
});
await step("client and react import under node (ESM)", async () => {
  const out = await $`node --input-type=module -e ${'const c = await import("@intheloop-studio/hermes-remote-client"); const r = await import("@intheloop-studio/hermes-remote-react"); console.log(typeof c.HermesClient, typeof r.useChat)'}`.cwd(app).text();
  if (out.trim() !== "function function") throw new Error(out);
});
await step("client types resolve for node16 consumers", async () => {
  writeFileSync(
    join(app, "consumer.ts"),
    'import { HermesClient, type ChatSessionMeta } from "@intheloop-studio/hermes-remote-client";\nimport { useChat } from "@intheloop-studio/hermes-remote-react";\nconst client = new HermesClient({ baseUrl: "http://x" });\nconst meta: ChatSessionMeta | null = null;\nexport { client, meta, useChat };\n',
  );
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "node16", moduleResolution: "node16", strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ["consumer.ts"] }),
  );
  await $`bun x tsc -p .`.cwd(app);
});
console.log("PACKAGES OK");
