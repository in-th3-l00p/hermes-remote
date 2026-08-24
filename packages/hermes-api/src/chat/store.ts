export interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  reactions: Record<string, number>;
  createdAt: string;
  editedAt: string | null;
  status: "streaming" | "done" | "error";
}

export interface ChatSession {
  id: string;
  createdAt: string;
  messages: ChatMessage[];
}

function randomId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class ChatStore {
  private readonly sessions = new Map<string, ChatSession>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  createSession(): ChatSession {
    const session: ChatSession = {
      id: randomId(),
      createdAt: this.now().toISOString(),
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): ChatSession | null {
    return this.sessions.get(id) ?? null;
  }

  addMessage(
    sessionId: string,
    input: {
      role: ChatMessage["role"];
      content: string;
      attachments?: Attachment[];
      status?: ChatMessage["status"];
    },
  ): ChatMessage | null {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return null;
    }
    const message: ChatMessage = {
      id: randomId(),
      role: input.role,
      content: input.content,
      attachments: input.attachments ?? [],
      reactions: {},
      createdAt: this.now().toISOString(),
      editedAt: null,
      status: input.status ?? "done",
    };
    session.messages.push(message);
    return message;
  }

  getMessage(sessionId: string, messageId: string): ChatMessage | null {
    const session = this.sessions.get(sessionId);
    return session?.messages.find((m) => m.id === messageId) ?? null;
  }

  appendContent(sessionId: string, messageId: string, text: string): void {
    const message = this.getMessage(sessionId, messageId);
    if (message !== null) {
      message.content += text;
    }
  }

  finishMessage(
    sessionId: string,
    messageId: string,
    status: "done" | "error",
  ): ChatMessage | null {
    const message = this.getMessage(sessionId, messageId);
    if (message !== null) {
      message.status = status;
    }
    return message;
  }

  /** Replaces a user message's content and drops everything after it. */
  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
  ): ChatMessage | null {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return null;
    }
    const index = session.messages.findIndex(
      (m) => m.id === messageId && m.role === "user",
    );
    if (index === -1) {
      return null;
    }
    const message = session.messages[index] as ChatMessage;
    message.content = content;
    message.editedAt = this.now().toISOString();
    session.messages.length = index + 1;
    return message;
  }

  toggleReaction(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): ChatMessage | null {
    const message = this.getMessage(sessionId, messageId);
    if (message === null) {
      return null;
    }
    if (message.reactions[emoji] === undefined) {
      message.reactions[emoji] = 1;
    } else {
      delete message.reactions[emoji];
    }
    return message;
  }
}
