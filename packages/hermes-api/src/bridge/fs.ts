import { mkdirSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { dirname, resolve as resolvePath, sep } from "node:path";

export class BridgeDenied extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BridgeDenied";
  }
}

const DENIED_BASENAMES = new Set([".env", "auth.json", "keys.json"]);
const DENIED_SUFFIXES = [".pem", ".key"];
const DENIED_SEGMENTS = new Set(["credentials"]);

/** File access rooted in a profile home; credential files are unreachable. */
export class FsBridge {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(options: { root: string; maxBytes?: number }) {
    this.root = resolvePath(options.root);
    this.maxBytes = options.maxBytes ?? 2_000_000;
  }

  resolve(relPath: string): string {
    const absolute = resolvePath(this.root, relPath);
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new BridgeDenied("path escapes the profile home");
    }
    const segments = absolute.slice(this.root.length).split(sep);
    for (const segment of segments) {
      const lower = segment.toLowerCase();
      if (DENIED_BASENAMES.has(lower) || DENIED_SEGMENTS.has(lower)) {
        throw new BridgeDenied(`access to ${segment} is not allowed`);
      }
      if (DENIED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
        throw new BridgeDenied(`access to ${segment} is not allowed`);
      }
    }
    return absolute;
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
