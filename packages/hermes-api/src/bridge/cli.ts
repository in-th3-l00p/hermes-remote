export interface CliResultData {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliBridge {
  run(argv: string[], options?: { timeoutMs?: number }): Promise<CliResultData>;
}

export type SpawnLike = (
  argv: string[],
  timeoutMs: number,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

async function defaultSpawn(
  argv: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({ cmd: argv, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    return {
      exitCode: exitCode === 0 ? 124 : exitCode,
      stdout,
      stderr: `${stderr}command timed out after ${timeoutMs}ms`,
    };
  }
  return { exitCode, stdout, stderr };
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

  async run(
    argv: string[],
    options: { timeoutMs?: number } = {},
  ): Promise<CliResultData> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      const result = await this.spawn(
        [this.binary, ...argv],
        options.timeoutMs ?? this.timeoutMs,
      );
      return { ok: result.exitCode === 0, ...result };
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
