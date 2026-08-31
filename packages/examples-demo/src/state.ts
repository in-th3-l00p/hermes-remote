import { DemoEventBus } from "./bus.ts";
import {
  HOMES,
  PROFILE_NAMES,
  seedEvents,
  seedRuns,
  seedSessions,
  type ProfileName,
} from "./seed.ts";
import type {
  DemoEvent,
  DemoMessage,
  DemoProfileHome,
  DemoRun,
  DemoSession,
  DemoSessionMeta,
} from "./types.ts";

export const MEMORY_LIMIT = 2200;
export const USER_LIMIT = 1375;

export interface Turn {
  /** Stop was requested; finish the partial reply as done. */
  aborted: boolean;
}

/** All mutable in-page backend state; one instance per createDemoFetch call. */
export class DemoState {
  readonly now: () => Date;
  readonly bus: DemoEventBus;
  readonly sessions = new Map<string, DemoSession>();
  readonly runs = new Map<string, DemoRun>();
  readonly turns = new Map<string, Turn>();
  readonly homes = new Map<ProfileName, DemoProfileHome>();
  readonly backlog: DemoEvent[];
  private seq = 1;

  constructor(now: () => Date) {
    this.now = now;
    this.bus = new DemoEventBus(now);
    const at = now();
    for (const session of seedSessions(at)) {
      this.sessions.set(session.id, session);
    }
    for (const run of seedRuns(at)) {
      this.runs.set(run.id, run);
    }
    for (const name of PROFILE_NAMES) {
      const home = HOMES[name];
      this.homes.set(name, { ...home, config: { ...home.config } });
    }
    this.backlog = seedEvents(at);
  }

  newId(prefix = ""): string {
    return `${prefix}${(this.seq++).toString(16).padStart(4, "0")}${Math.trunc(
      this.now().getTime() / 1000,
    ).toString(16)}`;
  }

  home(profile: string | null): DemoProfileHome | null {
    return this.homes.get((profile ?? "default") as ProfileName) ?? null;
  }

  createSession(userId: string | null): DemoSession {
    const at = this.now().toISOString();
    const session: DemoSession = {
      id: this.newId(),
      userId,
      title: null,
      createdAt: at,
      updatedAt: at,
      messages: [],
    };
    this.sessions.set(session.id, session);
    this.bus.publish("session.started", { session: session.id });
    return session;
  }

  listSessions(): DemoSessionMeta[] {
    return [...this.sessions.values()]
      .map(({ messages: _messages, ...meta }) => meta)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  addMessage(
    session: DemoSession,
    role: "user" | "assistant",
    content: string,
    status: "streaming" | "done",
  ): DemoMessage {
    const at = this.now().toISOString();
    const message: DemoMessage = {
      id: this.newId(),
      role,
      content,
      attachments: [],
      reactions: {},
      createdAt: at,
      editedAt: null,
      status,
    };
    session.messages.push(message);
    session.updatedAt = at;
    if (session.title === null && role === "user" && content !== "") {
      session.title = content.slice(0, 64);
    }
    return message;
  }

  /** Rewrites a user message and drops everything after it (regeneration). */
  editMessage(
    session: DemoSession,
    messageId: string,
    content: string,
  ): DemoMessage | null {
    const index = session.messages.findIndex((m) => m.id === messageId);
    const message = session.messages[index];
    if (message === undefined || message.role !== "user") {
      return null;
    }
    message.content = content;
    message.editedAt = this.now().toISOString();
    session.messages.length = index + 1;
    session.updatedAt = message.editedAt;
    return message;
  }

  toggleReaction(session: DemoSession, messageId: string, emoji: string): DemoMessage | null {
    const message = session.messages.find((m) => m.id === messageId);
    if (message === undefined) {
      return null;
    }
    if (message.reactions[emoji] === undefined) {
      message.reactions[emoji] = 1;
    } else {
      delete message.reactions[emoji];
    }
    return message;
  }

  createRun(input: string, output: string): DemoRun {
    const run: DemoRun = {
      id: this.newId("run_"),
      status: "completed",
      input,
      output,
      created_at: this.now().toISOString(),
    };
    this.runs.set(run.id, run);
    this.bus.publish("run.created", { id: run.id });
    return run;
  }
}
