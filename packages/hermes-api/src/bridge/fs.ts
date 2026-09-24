import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve as resolvePath, sep } from "node:path";

export class BridgeDenied extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BridgeDenied";
  }
}

const DENIED_BASENAMES = new Set([".env", "auth.json", "keys.json"]);
const DENIED_SUFFIXES = [".pem", ".key"];
const DENIED_SEGMENTS = new Set(["credentials"]);

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

function checkSegments(relative: string): void {
  for (const segment of relative.split(sep)) {
    const lower = segment.toLowerCase();
    if (DENIED_BASENAMES.has(lower) || DENIED_SEGMENTS.has(lower)) {
      throw new BridgeDenied(`access to ${segment} is not allowed`);
    }
    if (DENIED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
      throw new BridgeDenied(`access to ${segment} is not allowed`);
    }
  }
}

/** Resolves symlinks through the deepest existing ancestor of `path`. */
function realPath(path: string): string {
  let existing = path;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync(existing), ...rest);
}

/**
 * File access rooted in a directory (a profile home, or a subdirectory of
 * one via `scoped`). Paths may not escape the root lexically or through
 * symlinks, and credential files are unreachable.
 */
export class FsBridge {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(options: { root: string; maxBytes?: number }) {
    this.root = resolvePath(options.root);
    this.maxBytes = options.maxBytes ?? 2_000_000;
  }

  resolve(relPath: string): string {
    if (relPath.includes("\0")) {
      throw new BridgeDenied("path contains a NUL byte");
    }
    const absolute = resolvePath(this.root, relPath);
    if (!within(absolute, this.root)) {
      throw new BridgeDenied("path escapes the allowed directory");
    }
    checkSegments(absolute.slice(this.root.length));
    const realRoot = realPath(this.root);
    const real = realPath(absolute);
    if (!within(real, realRoot)) {
      throw new BridgeDenied("path escapes the allowed directory");
    }
    checkSegments(real.slice(realRoot.length));
    return absolute;
  }

  /** A bridge confined to a subdirectory of this one. */
  scoped(relDir: string): FsBridge {
    return new FsBridge({ root: this.resolve(relDir), maxBytes: this.maxBytes });
  }

  async read(relPath: string): Promise<string | null> {
    const path = this.resolve(relPath);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }
    if (file.size > this.maxBytes) {
      throw new BridgeDenied(`file exceeds ${this.maxBytes} bytes`);
    }
    return file.text();
  }

  async write(relPath: string, content: string): Promise<void> {
    if (Buffer.byteLength(content) > this.maxBytes) {
      throw new BridgeDenied(`content exceeds ${this.maxBytes} bytes`);
    }
    const path = this.resolve(relPath);
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, content);
  }

  async remove(relPath: string): Promise<boolean> {
    const path = this.resolve(relPath);
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  async list(relDir: string): Promise<string[]> {
    const path = this.resolve(relDir);
    try {
      await stat(path);
      return await readdir(path);
    } catch {
      return [];
    }
  }
}
