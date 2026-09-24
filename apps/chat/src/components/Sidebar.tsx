import { useState } from "react";
import type { ChatSessionMeta } from "@intheloop-studio/hermes-remote-react";

/** Chats: start one, search, open, rename, archive, delete. */
export function Sidebar({
  sessions,
  activeId,
  who,
  canSearch,
  onNew,
  onOpen,
  onRename,
  onArchive,
  onDelete,
  onSearch,
  onSignOut,
}: {
  sessions: ChatSessionMeta[];
  activeId: string | null;
  who: string;
  canSearch: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSearch: (query: string) => void;
  onSignOut: (() => void) | null;
}) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  return (
    <nav className="sidebar" aria-label="Chats">
      <button type="button" className="button primary wide" onClick={onNew}>
        New chat
      </button>
      {canSearch && (
        <form
          role="search"
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(query.trim());
          }}
        >
          <label htmlFor="search" className="visually-hidden">
            Search chats
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search chats"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim() === "") {
                onSearch("");
              }
            }}
          />
        </form>
      )}
      {sessions.length === 0 ? (
        <p className="muted small">
          {query.trim() === "" ? "Your chats will show up here." : "No chats match."}
        </p>
      ) : (
        <ul className="sessions">
          {sessions.map((s) => (
            <li key={s.id} className={s.id === activeId ? "active" : undefined}>
              {renaming === s.id ? (
                <form
                  className="rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (title.trim() !== "") {
                      onRename(s.id, title.trim());
                    }
                    setRenaming(null);
                  }}
                >
                  <label htmlFor={`title-${s.id}`} className="visually-hidden">
                    Chat name
                  </label>
                  <input
                    id={`title-${s.id}`}
                    value={title}
                    maxLength={120}
                    autoFocus
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                  />
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="session-open"
                    aria-current={s.id === activeId ? "true" : undefined}
                    onClick={() => onOpen(s.id)}
                  >
                    {s.title ?? "New chat"}
                  </button>
                  <span className="session-actions">
                    <button
                      type="button"
                      className="link"
                      aria-label={`Rename ${s.title ?? "chat"}`}
                      onClick={() => {
                        setTitle(s.title ?? "");
                        setRenaming(s.id);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="link"
                      aria-label={`Archive ${s.title ?? "chat"}`}
                      onClick={() => onArchive(s.id)}
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      aria-label={`Delete ${s.title ?? "chat"}`}
                      onClick={() => onDelete(s.id)}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="sidebar-foot">
        <span className="who">{who}</span>
        {onSignOut !== null && (
          <button type="button" className="link" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </footer>
    </nav>
  );
}
