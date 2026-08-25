import { dirname, join } from "node:path";
import { USAGE, fail, ok, type CliContext, type CliResult } from "../context.ts";

export function resolveServeArgv(ctx: CliContext): string[] {
  const bin = ctx.which("hermes-remote");
  return bin === null
    ? [ctx.execPath, ctx.entryPath, "serve"]
    : [bin, "serve"];
}

function serviceEnv(ctx: CliContext, argv: string[]): [string, string][] {
  const binDir = dirname(argv[0] as string);
  const entries: [string, string][] = [
    ["PATH", `${binDir}:/usr/local/bin:/usr/bin:/bin`],
  ];
  const home = ctx.env["HERMES_REMOTE_HOME"];
  if (home !== undefined) {
    entries.push(["HERMES_REMOTE_HOME", home]);
  }
  return entries;
}

function launchdUnit(ctx: CliContext, logPath: string): string {
  const argv = resolveServeArgv(ctx);
  const env = serviceEnv(ctx, argv)
    .map(([key, value]) => `    <key>${key}</key><string>${value}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hermes-remote.server</string>
  <key>ProgramArguments</key><array>
${argv.map((arg) => `    <string>${arg}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key><dict>
${env}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict></plist>
`;
}

function systemdUnit(ctx: CliContext, logPath: string): string {
  const argv = resolveServeArgv(ctx);
  const env = serviceEnv(ctx, argv)
    .map(([key, value]) => `Environment=${key}=${value}`)
    .join("\n");
  return `[Unit]
Description=Hermes Remote API server

[Service]
ExecStart=${argv.join(" ")}
${env}
Restart=always
RestartSec=5
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

export async function serviceCommand(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const action = args[0];
  const darwin = ctx.platform === "darwin";
  const unitPath = darwin
    ? join(ctx.homeDir, "com.hermes-remote.server.plist")
    : join(ctx.homeDir, "hermes-remote.service");
  const loadHint = darwin
    ? `cp ${unitPath} ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.hermes-remote.server.plist`
    : `cp ${unitPath} ~/.config/systemd/user/ && systemctl --user enable --now hermes-remote`;

  if (action === "install") {
    const logPath = join(ctx.homeDir, "logs", "service.log");
    const unit = darwin ? launchdUnit(ctx, logPath) : systemdUnit(ctx, logPath);
    try {
      await Bun.write(unitPath, unit);
    } catch (error) {
      return fail(`failed to write ${unitPath}: ${(error as Error).message}`);
    }
    return ok(`wrote ${unitPath}\n\nto activate:\n  ${loadHint}`);
  }
  if (action === "uninstall" && darwin) {
    return ok(
      "launchctl unload ~/Library/LaunchAgents/com.hermes-remote.server.plist && rm ~/Library/LaunchAgents/com.hermes-remote.server.plist",
    );
  }
  if (action === "uninstall") {
    return ok(
      "systemctl --user disable --now hermes-remote && rm ~/.config/systemd/user/hermes-remote.service",
    );
  }
  if (action === "status") {
    return ok(`unit file: ${unitPath}\nactivate with:\n  ${loadHint}`);
  }
  return fail(`unknown service action: ${action ?? "(none)"}\n\n${USAGE}`);
}
