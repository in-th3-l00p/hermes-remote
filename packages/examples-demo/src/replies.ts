const GENERIC: string[] = [
  "Here is where that stands: I checked the workspace and nothing is blocking. Give me a concrete target, a file, a service, or a command, and I will take it from there.",
  "I can do that. Quick plan: inspect the current state, make the change on a branch, run the tests, and report back with the diff. Say the word and I start.",
  "Short answer: yes. Longer answer: I would want to verify against staging first before touching anything shared. Want me to run the check now?",
];

interface Rule {
  test: RegExp;
  reply: string;
}

const RULES: Rule[] = [
  {
    test: /deploy|release|ship|promote/,
    reply:
      "Staging looks clear to deploy: tests green, no pending migrations, error rate flat for the last hour. The usual order is tag, push, then watch the release workflow. I can run the whole sequence and report each step here.",
  },
  {
    test: /\blogs?\b|errors? (in|from)|stack ?trace/,
    reply:
      "Tailing the last hour of logs: mostly routine, one repeating warning from the image proxy (upstream timeout, self-recovering) and a single 500 from the webhook signer at :12 past. The 500 has a null `signing_key` in the stack, the same bug as last night's summary. Want the full trace?",
  },
  {
    test: /bug|broken|fail|flaky|crash|not working/,
    reply:
      "Let me reproduce it before guessing. I ran the failing path twice: first run passes, second fails, so there is shared state between runs. The usual suspects here are the Redis fixture and module-level caches. I will bisect with the cache disabled and report what flips it.",
  },
  {
    test: /haiku|poem/,
    reply: "Streams open, tokens\nfall one by one into place,\nthe cursor goes still.",
  },
  {
    test: /^(hi|hey|hello|yo)\b|^good (morning|afternoon|evening)/,
    reply:
      "Hey. I have terminal, files, and web access on this machine. Ask me to check something, fix something, or explain something, whatever is on your plate.",
  },
  {
    test: /\btests?\b|coverage|spec\b/,
    reply:
      "Ran the suite: 457 tests, all passing, line and function coverage at 100%. The slowest file is the SSE parser spec at 1.2s. Nothing flaky in the last ten runs except the login spec, which we already traced to the shared Redis fixture.",
  },
  {
    test: /remember|memory|note that/,
    reply:
      "Noted. I added it to MEMORY.md so it survives this session. I keep that file small on purpose; if it fills up I will consolidate older entries before dropping anything.",
  },
];

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

/** Deterministic, plausible assistant reply for a chat prompt. */
export function pickReply(prompt: string): string {
  const lower = prompt.toLowerCase();
  for (const rule of RULES) {
    if (rule.test.test(lower)) {
      return rule.reply;
    }
  }
  return GENERIC[hash(lower) % GENERIC.length] as string;
}

/** Deterministic final output for a submitted run. */
export function pickRunOutput(input: string): string {
  const lower = input.toLowerCase();
  if (/haiku|poem/.test(lower)) {
    return "A background task hums,\nevents drip through the wire,\ndone, the stream closes.";
  }
  if (/audit|cve|securit/.test(lower)) {
    return "Audit complete. 214 packages checked, one moderate advisory in undici (header smuggling, patch available). Details and the suggested bump are in the report.";
  }
  if (/index|migrat|rebuild/.test(lower)) {
    return "Finished without downtime: built the replacement in the background, verified row counts match, and swapped over. Total wall time 9m14s.";
  }
  return `Task finished: ${input.trim()}. I broke it into three steps, verified each against staging, and left a summary with the exact commands in the run log.`;
}

/** Splits a reply into small chunks so the stream visibly drips. */
export function chunked(text: string): string[] {
  const parts = text.match(/\S+\s*/g);
  return parts === null ? [text] : parts;
}
