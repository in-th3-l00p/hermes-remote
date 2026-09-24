export interface CliResultData {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Raw stdout, for binary output such as archives. */
  stdoutBytes?: Uint8Array;
  /** Set when the binary could not be started at all (missing, not executable). */
  unavailable?: true;
}

export interface CliBridge {
  run(argv: string[], options?: { timeoutMs?: number }): Promise<CliResultData>;
}

export type SpawnLike = (
  argv: string[],
  timeoutMs: number,
) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutBytes?: Uint8Array;
}>;

async function defaultSpawn(
  argv: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; stdoutBytes: Uint8Array }> {
  const proc = Bun.spawn({ cmd: argv, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  // Bun's own readers, not `new Response(...)`: the global Response can be
  // replaced (e.g. by a DOM shim) and must not affect process I/O.
  const [exitCode, stdoutBytes, stderr] = await Promise.all([
    proc.exited,
    Bun.readableStreamToBytes(proc.stdout),
    Bun.readableStreamToText(proc.stderr),
  ]);
  const stdout = new TextDecoder().decode(stdoutBytes);
  clearTimeout(timer);
  if (timedOut) {
    return {
      exitCode: exitCode === 0 ? 124 : exitCode,
      stdout,
      stderr: `${stderr}command timed out after ${timeoutMs}ms`,
      stdoutBytes,
    };
  }
  return { exitCode, stdout, stderr, stdoutBytes };
}

/** Executes the hermes binary; callers supply allowlisted argv templates. */
export class HermesCliBridge implements CliBridge {
  private readonly binary: string;
  private readonly spawn: SpawnLike;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(options: {
    binary: string;
    spawn?: SpawnLike;
    timeoutMs?: number;
    maxConcurrent?: number;
  }) {
    this.binary = options.binary;
    this.spawn = options.spawn ?? defaultSpawn;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxConcurrent = options.maxConcurrent ?? 4;
  }

  async run(argv: string[], options: { timeoutMs?: number } = {}): Promise<CliResultData> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      const result = await this.spawn([this.binary, ...argv], options.timeoutMs ?? this.timeoutMs);
      return { ok: result.exitCode === 0, ...result };
    } catch (cause) {
      return {
        ok: false,
        exitCode: 127,
        stdout: "",
        stderr: `could not start ${this.binary}: ${(cause as Error).message}`,
        unavailable: true,
      };
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
