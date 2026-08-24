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

export type ChatEvent =
  | { event: "user"; data: ChatMessage }
  | { event: "assistant"; data: { id: string } }
  | { event: "delta"; data: { id: string; text: string } }
  | { event: "done"; data: ChatMessage }
  | { event: "error"; data: { id?: string; message: string } };
