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
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}
