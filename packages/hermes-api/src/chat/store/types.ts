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

export interface ChatSessionMeta {
  id: string;
  userId: string | null;
  /** Id of the API key that created the session, when a key did. */
  keyId: string | null;
  title: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}
