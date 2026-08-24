import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { createClient } from "@supabase/supabase-js";
import { HermesClient, useChat } from "@in-th3-l00p/hermes-web-react";
import type {
  Attachment,
  ChatMessage,
  ChatSessionMeta,
} from "@in-th3-l00p/hermes-web-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_URL =
  (import.meta.env["VITE_HERMES_API_URL"] as string | undefined) ??
  "http://localhost:8643";
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] as
  | string
  | undefined;

const supabase =
  SUPABASE_URL !== undefined && SUPABASE_ANON_KEY !== undefined
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const LOCAL_SESSIONS_KEY = "hermes-chat-sessions";
const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "🤔"];

function localSessionIds(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem(LOCAL_SESSIONS_KEY) ?? "[]",
    ) as string[];
  } catch {
    return [];
  }
}

function rememberLocalSession(id: string): void {
  const ids = localSessionIds();
  if (!ids.includes(id)) {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([id, ...ids]));
  }
}

function readFileAsDataUrl(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        dataUrl: String(reader.result),
      });
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Bubble({
  message,
  streaming,
  onReact,
  onEdit,
}: {
  message: ChatMessage;
  streaming: boolean;
  onReact: (emoji: string) => void;
  onEdit: (() => void) | null;
}) {
  const mine = message.role === "user";
  const reactions = Object.keys(message.reactions);
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "group relative max-w-[80%] rounded-xl border px-3.5 py-2.5 text-sm",
          mine
            ? "bg-primary text-primary-foreground border-transparent"
            : "bg-card text-card-foreground",
        )}
      >
        {message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <img
                key={a.name}
                src={a.dataUrl}
                alt={a.name}
                className="max-h-44 max-w-60 rounded-lg"
              />
            ))}
          </div>
        )}
        <div
          className={cn(
            "space-y-2 break-words",
            "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
            "[&_code]:font-mono [&_code]:text-xs",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold",
            mine
              ? "[&_pre]:bg-primary-foreground/10"
              : "[&_pre]:bg-muted [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          )}
        >
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {message.status === "streaming" && (
            <span className="animate-pulse">▍</span>
          )}
          {message.status === "error" && (
            <Badge variant="destructive">failed to generate</Badge>
          )}
        </div>
        <div
          className={cn(
            "mt-1 flex justify-end gap-1.5 text-[10px]",
            mine ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          {message.editedAt !== null && <span>edited</span>}
          <span>{time(message.createdAt)}</span>
        </div>
        {reactions.length > 0 && (
          <div className="mt-1 flex gap-1">
            {reactions.map((emoji) => (
              <Badge
                key={emoji}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => onReact(emoji)}
              >
                {emoji} 1
              </Badge>
            ))}
          </div>
        )}
        {!streaming && (
          <div className="bg-popover absolute -top-9 right-0 hidden items-center gap-0.5 rounded-full border p-0.5 shadow-md group-hover:flex">
            {REACTION_CHOICES.map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-sm"
                onClick={() => onReact(emoji)}
              >
                {emoji}
              </Button>
            ))}
            {onEdit !== null && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-sm"
                onClick={onEdit}
              >
                ✏️
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type AuthState = "loading" | "signedOut" | "signedIn";

function AuthGate({ onError }: { onError: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error !== null) {
      onError(error.message);
    }
  };

  return (
    <div className="bg-background flex h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <p className="text-muted-foreground text-xl">✧</p>
          <CardTitle>Sign in to hermes chat</CardTitle>
          <CardDescription>
            The agent requires an identity — sign in with your email, or
            continue as an anonymous guest.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(["google", "github"] as const).map((provider) => (
              <Button
                key={provider}
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    (supabase as NonNullable<typeof supabase>).auth
                      .signInWithOAuth({
                        provider,
                        options: { redirectTo: window.location.origin },
                      }),
                  )
                }
              >
                {provider === "google" ? "Google" : "GitHub"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">
              or with email
            </span>
            <Separator className="flex-1" />
          </div>
          {!codeSent ? (
            <>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                disabled={busy || !email.includes("@")}
                onClick={() =>
                  void run(async () => {
                    const res = await (supabase as NonNullable<typeof supabase>)
                      .auth.signInWithOtp({ email });
                    if (res.error === null) {
                      setCodeSent(true);
                    }
                    return res;
                  })
                }
              >
                Send code
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                We emailed a 6-digit code to{" "}
                <span className="text-foreground font-medium">{email}</span>.
              </p>
              <Input
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                disabled={busy || code.length < 6}
                onClick={() =>
                  void run(() =>
                    (supabase as NonNullable<typeof supabase>).auth.verifyOtp({
                      email,
                      token: code,
                      type: "email",
                    }),
                  )
                }
              >
                Verify
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCodeSent(false)}
              >
                use a different email
              </Button>
            </>
          )}
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() =>
                (supabase as NonNullable<typeof supabase>).auth
                  .signInAnonymously(),
              )
            }
          >
            Continue as guest
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>(
    supabase === null ? "signedIn" : "loading",
  );
  const [identity, setIdentity] = useState("anonymous");
  const [authError, setAuthError] = useState<string | null>(null);
  const authReady = authState === "signedIn";

  useEffect(() => {
    if (supabase === null) {
      return;
    }
    const apply = (session: { user: { id: string; email?: string | undefined; is_anonymous?: boolean | undefined } } | null) => {
      if (session === null) {
        setAuthState("signedOut");
        setIdentity("anonymous");
        return;
      }
      const { user } = session;
      setIdentity(
        user.email !== undefined && user.email !== ""
          ? user.email
          : `guest · ${user.id.slice(0, 8)}`,
      );
      setAuthState("signedIn");
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const client = useMemo(
    () =>
      new HermesClient({
        baseUrl: API_URL,
        ...(supabase === null
          ? {}
          : {
              tokenProvider: async () =>
                (await supabase.auth.getSession()).data.session
                  ?.access_token ?? "",
            }),
      }),
    [],
  );

  const chat = useChat({ client });
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSessions = useCallback(async () => {
    if (!authReady) {
      return;
    }
    const metas =
      supabase !== null
        ? await client.listSessions()
        : await client.listSessions(localSessionIds());
    setSessions(metas);
  }, [client, authReady]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages]);

  useEffect(() => {
    if (chat.sessionId !== null && supabase === null) {
      rememberLocalSession(chat.sessionId);
    }
  }, [chat.sessionId]);

  const submit = async () => {
    const content = draft.trim();
    if ((content === "" && attachments.length === 0) || chat.streaming) {
      return;
    }
    setDraft("");
    setAttachments([]);
    if (editing !== null) {
      const target = editing;
      setEditing(null);
      await chat.edit(target.id, content);
    } else {
      await chat.send(content, attachments);
    }
    await refreshSessions();
  };

  const pickFiles = async (files: FileList | null) => {
    if (files === null) {
      return;
    }
    const loaded = await Promise.all([...files].map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded]);
  };

  if (supabase !== null && authState === "loading") {
    return (
      <div className="bg-background text-muted-foreground flex h-dvh items-center justify-center text-sm">
        ✧ loading…
      </div>
    );
  }

  if (supabase !== null && authState === "signedOut") {
    return (
      <>
        <AuthGate onError={setAuthError} />
        {authError !== null && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
            <Badge variant="destructive">{authError}</Badge>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-background text-foreground mx-auto flex h-dvh max-w-5xl border-x">
      <aside className="bg-sidebar text-sidebar-foreground hidden w-72 flex-col border-r sm:flex">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm font-semibold">Chats</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title="new chat"
            onClick={() => {
              chat.reset();
              setEditing(null);
              setDraft("");
            }}
          >
            ＋
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {sessions.length === 0 && (
              <p className="text-muted-foreground p-4 text-center text-xs">
                No conversations yet
              </p>
            )}
            {sessions.map((s) => (
              <Button
                key={s.id}
                variant={s.id === chat.sessionId ? "secondary" : "ghost"}
                className="h-auto w-full justify-between gap-2 px-3 py-2"
                onClick={() => void chat.open(s.id)}
              >
                <span className="truncate text-sm font-normal">
                  {s.title ?? "New chat"}
                </span>
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {time(s.updatedAt)}
                </span>
              </Button>
            ))}
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex items-center justify-between gap-2 p-4">
          <p className="text-muted-foreground truncate font-mono text-xs">
            {identity}
          </p>
          {supabase !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-xs"
              onClick={() => {
                chat.reset();
                setSessions([]);
                void supabase.auth.signOut();
              }}
            >
              sign out
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b p-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback>H</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Hermes Agent</p>
            <p className="text-muted-foreground text-xs">
              {chat.streaming ? "typing…" : "online · conversations persist"}
            </p>
          </div>
        </header>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4">
          {chat.messages.length === 0 && (
            <div className="text-muted-foreground mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 text-center text-sm">
              <span className="text-2xl">✧</span>
              <p>
                Say hi to your Hermes agent. Markdown, image attachments,
                reactions and edits all work — and conversations are saved in
                the sidebar.
              </p>
            </div>
          )}
          {chat.messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              streaming={chat.streaming}
              onReact={(emoji) => void chat.react(message.id, emoji)}
              onEdit={
                message.role === "user"
                  ? () => {
                      setEditing(message);
                      setDraft(message.content);
                    }
                  : null
              }
            />
          ))}
          {chat.error !== null && (
            <div className="flex justify-center">
              <Badge variant="destructive">{chat.error}</Badge>
            </div>
          )}
        </div>

        <footer className="border-t p-3">
          {editing !== null && (
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
              ✏️ editing message
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
              >
                cancel
              </Button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="mb-2 flex gap-2">
              {attachments.map((a) => (
                <div key={a.name} className="relative">
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full text-xs"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((x) => x !== a))
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              title="attach image"
              onClick={() => fileRef.current?.click()}
            >
              📎
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Textarea
              placeholder={authReady ? "Message" : "Signing in…"}
              value={draft}
              rows={1}
              disabled={!authReady}
              className="max-h-36 min-h-9 resize-none"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => void submit()}
              disabled={chat.streaming || !authReady}
            >
              ➤
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
