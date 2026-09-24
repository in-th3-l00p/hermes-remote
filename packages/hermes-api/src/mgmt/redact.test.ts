import { describe, expect, test } from "bun:test";
import { redact } from "./redact.ts";

describe("redact", () => {
  test("masks secret-named settings in env, yaml and json forms", () => {
    const input = [
      "OPENAI_API_KEY=abc123def456",
      "API_SERVER_KEY = hunter2hunter2",
      "  api_key: 'quoted-secret'",
      'token: "double-quoted"',
      '{"client_secret": "s3cr3t", "name": "ok"}',
      "SLACK_BOT_TOKEN=xoxb-1234567890-abcdef",
      "model: claude-opus",
      "auth_enabled: true",
      "password: null",
    ].join("\n");
    const out = redact(input);
    for (const secret of ["abc123def456", "hunter2hunter2", "quoted-secret", "double-quoted", "s3cr3t", "xoxb-1234567890"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("OPENAI_API_KEY=[redacted]");
    expect(out).toContain("model: claude-opus");
    expect(out).toContain("auth_enabled: true");
    expect(out).toContain("password: null");
    expect(out).toContain('"name": "ok"');
  });

  test("masks recognizable credentials anywhere", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlX2hlcmU";
    const input = [
      "Authorization: Bearer abcdefghijklmnop",
      `session ${jwt} ok`,
      "provider sk-ant-api03-ABCDEFGHIJ in use",
      "ghp_0123456789abcdefghijABCDEFGHIJ pushed",
      "github_pat_11ABCDEFG0123456789_abcdefghij",
      "AIzaSyA-0123456789abcdefghijklmnopqrstu",
      "AKIAIOSFODNN7EXAMPLE",
      "hk_1a2b3c.4d5e6f7a8b",
    ].join("\n");
    const out = redact(input);
    expect(out).toContain("Authorization: Bearer [redacted]\n");
    expect(out).not.toContain("abcdefghijklmnop");
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("sk-ant-api03");
    expect(out).not.toContain("ghp_0123");
    expect(out).not.toContain("github_pat_11");
    expect(out).not.toContain("AIzaSy");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).not.toContain("hk_1a2b3c.4d5e");
    expect(out).toContain("session [redacted] ok");
  });

  test("leaves ordinary output alone", () => {
    const input = "status: running\nprofiles: default, work\nuptime 3h";
    expect(redact(input)).toBe(input);
  });
});
