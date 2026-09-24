import { z } from "zod";

/** Shared request/response shapes for the OpenAPI document. */

export const ErrorBody = z
  .object({
    error: z.object({
      code: z.string().describe("Machine-readable error code"),
      message: z.string(),
    }),
  })
  .meta({ id: "Error" });

export const Status = z.object({ ok: z.boolean(), version: z.string() }).meta({ id: "Status" });

export const CliResult = z
  .object({ ok: z.literal(true), raw: z.string().describe("Command output, secrets redacted") })
  .meta({ id: "CliResult" });

export const Attachment = z
  .object({
    name: z.string().max(255),
    type: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    dataUrl: z.string().describe("Inline base64 data URL whose type matches `type`"),
  })
  .meta({ id: "Attachment" });

export const ChatMessage = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    attachments: z.array(Attachment),
    reactions: z.record(z.string(), z.number()),
    createdAt: z.string(),
    editedAt: z.string().nullable(),
    status: z.enum(["streaming", "done", "error"]),
  })
  .meta({ id: "ChatMessage" });

export const ChatSessionMeta = z
  .object({
    id: z.string(),
    userId: z.string().nullable(),
    keyId: z.string().nullable(),
    title: z.string().nullable(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "ChatSessionMeta" });

export const ChatSession = ChatSessionMeta.extend({ messages: z.array(ChatMessage) }).meta({
  id: "ChatSession",
});

export const SendMessage = z
  .object({
    content: z.string().max(8_000),
    attachments: z.array(Attachment).max(4).optional(),
  })
  .meta({ id: "SendMessage" });

export const EditMessage = z.object({ content: z.string().min(1).max(8_000) });

export const Reaction = z.object({
  emoji: z.string().min(1).max(16).describe("A short token without whitespace"),
});

export const SessionPatch = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.archived !== undefined, "send title and/or archived");

export const ForkSession = z.object({ messageId: z.string().optional() });

export const RunCreate = z
  .looseObject({
    input: z
      .union([z.string(), z.array(z.unknown())])
      .describe("Required for user tokens; system/developer turns in an array are dropped"),
  })
  .meta({ id: "RunCreate" });

export const Forwarded = z
  .looseObject({})
  .describe("Forwarded to the agent's API server unchanged")
  .meta({ id: "Forwarded" });

export const AgentVisibility = z.enum(["anonymous", "pseudonymous", "full"]);

const MAX_JSON = 8_192;
/** A JSON object of at most 8 KB. */
const JsonObject = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= MAX_JSON, `at most ${MAX_JSON} bytes`);

export const User = z
  .object({
    id: z.string(),
    identities: z.array(z.object({ provider: z.string(), subject: z.string() })),
    profile: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    agentVisibility: AgentVisibility,
    disabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "User" });

export const UserChanges = z.object({
  profile: JsonObject.optional(),
  metadata: JsonObject.optional().describe("Never shown to the agent"),
  agent_visibility: AgentVisibility.optional(),
});

export const TokenExchange = z
  .object({
    user: UserChanges.extend({
      provider: z.string().min(1).max(200),
      subject: z.string().min(1).max(200),
    }),
    scopes: z.array(z.string()).min(1).describe("Must be in the key's user-grantable list"),
    ttl: z.number().int().min(60).max(86_400).default(900),
  })
  .meta({ id: "TokenExchange" });

export const TokenExchangeResult = z
  .object({ token: z.string(), expires_at: z.string(), user: User })
  .meta({ id: "TokenExchangeResult" });

export const Identity = z.object({
  provider: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
});

export const WhoAmI = z
  .union([
    z.object({
      type: z.literal("api_key"),
      id: z.string(),
      name: z.string(),
      scopes: z.array(z.string()),
    }),
    z.object({
      type: z.literal("user"),
      id: z.string(),
      email: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      visibility: AgentVisibility.optional(),
    }),
    z.object({ type: z.literal("anonymous") }),
  ])
  .meta({ id: "WhoAmI" });

export const Content = z.object({ content: z.string() });
export const NamedContent = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  content: z.string(),
});
export const MemoryEntry = z.object({
  action: z.enum(["add", "replace", "remove"]),
  text: z.string(),
  from: z.string().optional().describe("The entry to replace"),
});
export const Text = z.object({ text: z.string().trim().min(1) });
export const GoalSet = z.object({ text: z.string().trim().min(1), draft: z.boolean().optional() });
export const GoalWait = z.object({
  pid: z.number().int().positive(),
  reason: z.string().optional(),
});
export const GateAdd = z.object({ command: z.string().trim().min(1) });
export const CommandRun = z.object({ command: z.string().startsWith("/").describe("One line") });
/** A value passed to the hermes CLI: never empty, never flag-like. */
const CliArg = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("-"), 'must not start with "-"');
export const ProfileCreate = z.object({ name: CliArg });
export const ProfilePatch = z.object({ rename: CliArg.optional(), description: CliArg.optional() });
export const ProfileInstall = z.object({ source: CliArg });
export const ToolsetToggle = z.object({ name: CliArg, enabled: z.boolean() });
export const Prompt = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  model: z.string().optional(),
});
export const Query = z.object({ query: z.string().trim().min(1).max(8_000) });
export const Url = z.object({ url: z.string().describe("A public http(s) URL") });
export const Task = z.object({ task: z.string().trim().min(1).max(8_000) });
