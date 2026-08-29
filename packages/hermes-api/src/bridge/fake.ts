import type { CliBridge, CliResultData } from "./cli.ts";

type FakeResponse = Partial<CliResultData> | (() => Partial<CliResultData>);

function complete(partial: Partial<CliResultData>): CliResultData {
  const exitCode = partial.exitCode ?? 0;
  return {
    exitCode,
    ok: partial.ok ?? exitCode === 0,
    stdout: partial.stdout ?? "",
    stderr: partial.stderr ?? "",
  };
}

/** Test double: maps argv prefixes (joined with spaces) to canned results. */
export class FakeCliBridge implements CliBridge {
  readonly calls: string[][] = [];
  private readonly responses: Map<string, FakeResponse>;

  constructor(responses: Record<string, FakeResponse> = {}) {
    this.responses = new Map(Object.entries(responses));
  }

  on(argvPrefix: string, result: FakeResponse): void {
    this.responses.set(argvPrefix, result);
  }

  async run(argv: string[]): Promise<CliResultData> {
    this.calls.push(argv);
    const joined = argv.join(" ");
    let best: FakeResponse | null = null;
    let bestLength = -1;
    for (const [prefix, response] of this.responses) {
      if (
        (joined === prefix || joined.startsWith(`${prefix} `)) &&
        prefix.length > bestLength
      ) {
        best = response;
        bestLength = prefix.length;
      }
    }
    if (best === null) {
      return complete({ exitCode: 127, stderr: `no response for: ${joined}` });
    }
    return complete(typeof best === "function" ? best() : best);
  }
}
