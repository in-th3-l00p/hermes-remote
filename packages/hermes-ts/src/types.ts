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
  /** Id of the API key that created the session (servers from 3.2.1). */
  keyId?: string | null;
  title: string | null;
  /** Hidden from the default listing (servers from 3.4). */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}

export type ChatEvent =
  | { event: "user"; data: ChatMessage }
  | { event: "assistant"; data: { id: string } }
  | { event: "delta"; data: { id: string; text: string } }
  | { event: "done"; data: ChatMessage }
  | { event: "error"; data: { id?: string; message: string } };
