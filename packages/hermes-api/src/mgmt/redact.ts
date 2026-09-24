const MASK = "[redacted]";

/** Values of settings whose name says they are secret (env, YAML, JSON). */
const SECRET_ASSIGNMENT =
  /((?:^|[\s"'{,])[A-Za-z0-9_.-]*(?:key|token|secret|password|passwd|pwd|credential|auth)[A-Za-z0-9_.-]*["']?\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,}\n]+)/gim;

/** Credentials recognizable on their own, wherever they appear. */
const TOKEN_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /\bsk-[A-Za-z0-9_-]{8,}/g, // OpenAI / Anthropic style
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/g, // Slack
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g, // Google
  /\bAKIA[A-Z0-9]{16}\b/g, // AWS access key id
  /\bhk_[0-9a-f]+\.[0-9a-f]+/g, // hermes-remote keys
];

/**
 * Masks secrets in text produced by the hermes CLI before it is returned to
 * an API caller. Structure is kept (names, keys, line layout) so output stays
 * readable; only the secret values are replaced.
 */
export function redact(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, (match) =>
      match.startsWith("Bearer") ? `Bearer ${MASK}` : MASK,
    );
  }
  return out.replace(
    SECRET_ASSIGNMENT,
    (_m, prefix: string, value: string) =>
      /^(?:["']?(?:null|none|true|false|bearer|\*+|\[redacted\])["']?|["']{2})$/i.test(value)
        ? `${prefix}${value}`
        : `${prefix}${MASK}`,
  );
}
