/**
 * Anonymous chats are addressed by id, so the browser remembers which
 * sessions it created. Signed-in users don't need this.
 */
const KEY = "hermes-chat-sessions";

export function localSessionIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberSession(id: string): void {
  const ids = localSessionIds();
  if (!ids.includes(id)) {
    try {
      localStorage.setItem(KEY, JSON.stringify([id, ...ids]));
    } catch {
      // Storage unavailable (private mode): the chat still works this visit.
    }
  }
}
