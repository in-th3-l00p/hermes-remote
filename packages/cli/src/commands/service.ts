import { join } from "node:path";
import { USAGE, fail, ok, type CliContext, type CliResult } from "../context.ts";

export function serviceCommand(args: string[], ctx: CliContext): CliResult {
  const action = args[0];
  const darwin = ctx.platform === "darwin";
  const unitPath = darwin
    ? join(ctx.homeDir, "com.hermes-remote.server.plist")
    : join(ctx.homeDir, "hermes-remote.service");
  const loadHint = darwin
    ? `cp ${unitPath} ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.hermes-remote.server.plist`
    : `cp ${unitPath} ~/.config/systemd/user/ && systemctl --user enable --now hermes-remote`;

  if (action === "install") {
    const unit = darwin
      ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hermes-remote.server</string>
  <key>ProgramArguments</key><array>
    <string>hermes-remote</string><string>serve</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${join(ctx.homeDir, "logs", "service.log")}</string>
</dict></plist>
`
      : `[Unit]
Description=Hermes Remote API server

[Service]
ExecStart=hermes-remote serve
Restart=always

[Install]
WantedBy=default.target
`;
    Bun.write(unitPath, unit);
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
