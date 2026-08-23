import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface ApiKeyRecord {
  id: string;
  name: string;
  hash: string;
  scopes: string[];
  userGrantable: string[];
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
}

export interface CreateKeyInput {
  name: string;
  scopes: string[];
  userGrantable?: string[];
  expiresAt?: Date;
  now?: Date;
}

interface KeysFile {
  keys: ApiKeyRecord[];
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class KeyStore {
  constructor(readonly filePath: string) {}

  private async load(): Promise<KeysFile> {
    const file = Bun.file(this.filePath);
    if (!(await file.exists())) {
      return { keys: [] };
    }
    return (await file.json()) as KeysFile;
  }

  private async save(data: KeysFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await Bun.write(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
  }

  async create(
    input: CreateKeyInput,
  ): Promise<{ record: ApiKeyRecord; token: string }> {
    const data = await this.load();
    const id = randomHex(6);
    const secret = randomHex(24);
    const record: ApiKeyRecord = {
      id,
      name: input.name,
      hash: await Bun.password.hash(secret),
      scopes: [...new Set(input.scopes)].sort(),
      userGrantable: [...new Set(input.userGrantable ?? [])].sort(),
      createdAt: (input.now ?? new Date()).toISOString(),
      expiresAt: input.expiresAt?.toISOString() ?? null,
      revoked: false,
    };
    data.keys.push(record);
    await this.save(data);
    return { record, token: `hk_${id}.${secret}` };
  }

  async list(): Promise<ApiKeyRecord[]> {
    return (await this.load()).keys;
  }

  async get(id: string): Promise<ApiKeyRecord | null> {
    return (await this.load()).keys.find((k) => k.id === id) ?? null;
  }

  private async update(
    id: string,
    change: (record: ApiKeyRecord) => void,
  ): Promise<ApiKeyRecord | null> {
    const data = await this.load();
    const record = data.keys.find((k) => k.id === id);
    if (record === undefined) {
      return null;
    }
    change(record);
    await this.save(data);
    return record;
  }

  revoke(id: string): Promise<ApiKeyRecord | null> {
    return this.update(id, (record) => {
      record.revoked = true;
    });
  }

  grantScopes(id: string, scopes: string[]): Promise<ApiKeyRecord | null> {
    return this.update(id, (record) => {
      record.scopes = [...new Set([...record.scopes, ...scopes])].sort();
    });
  }

  ungrantScopes(id: string, scopes: string[]): Promise<ApiKeyRecord | null> {
    return this.update(id, (record) => {
      record.scopes = record.scopes.filter((s) => !scopes.includes(s));
    });
  }

  async verifyToken(
    token: string,
    now: Date = new Date(),
  ): Promise<ApiKeyRecord | null> {
    const match = /^hk_([0-9a-f]+)\.([0-9a-f]+)$/.exec(token);
    if (match === null) {
      return null;
    }
    const record = await this.get(match[1] as string);
    if (record === null || record.revoked) {
      return null;
    }
    if (record.expiresAt !== null && new Date(record.expiresAt) <= now) {
      return null;
    }
    const valid = await Bun.password.verify(match[2] as string, record.hash);
    return valid ? record : null;
  }
}
