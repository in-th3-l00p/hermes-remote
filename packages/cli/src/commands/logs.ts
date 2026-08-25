import { flag, parseArgs } from "../args.ts";
import { fail, ok, type CliResult } from "../context.ts";

export async function logsCommand(
  args: string[],
  logPath: string,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const tail = Number(flag(parsed, "tail") ?? "50");
  if (!Number.isInteger(tail) || tail <= 0) {
    return fail(`invalid --tail: ${flag(parsed, "tail") as string}`);
  }
  const file = Bun.file(logPath);
  if (!(await file.exists())) {
    return ok("no logs yet");
  }
  const lines = (await file.text()).trimEnd().split("\n");
  return ok(lines.slice(-tail).join("\n"));
}
