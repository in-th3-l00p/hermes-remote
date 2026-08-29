# 3.1 Build a chat app in React

This walks the essentials of the reference app ([apps/chat](https://github.com/in-th3-l00p/hermes-remote/tree/main/apps/chat)): a Telegram style chat with streaming, markdown, attachments, reactions, and edits.

## 1. Run the stack

```bash
hermes-remote serve --anonymous --cors http://localhost:5173 \
  --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

`--anonymous` keeps this tutorial friction free; switch to real auth with [3.2](/tutorials/supabase-auth).

## 2. Wire the hook

```tsx
import { HermesClient, useChat } from "@in-th3-l00p/hermes-remote-react";

const client = new HermesClient({ baseUrl: "http://localhost:8643" });

export function App() {
  const chat = useChat({ client });
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const content = draft.trim();
    if (content === "" || chat.streaming) return;
    setDraft("");
    await chat.send(content);
  };

  return (
    <main>
      {chat.messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
    </main>
  );
}
```

## 3. Markdown and the streaming cursor

Messages stream token by token into `chat.messages`, so a bubble is just markdown plus a cursor while `status === "streaming"`:

```tsx
import ReactMarkdown from "react-markdown";

function Bubble({ message }: { message: ChatMessage }) {
  return (
    <div>
      <ReactMarkdown>{message.content}</ReactMarkdown>
      {message.status === "streaming" && <span>▍</span>}
    </div>
  );
}
```

## 4. Attachments

Attachments are image data URLs; read files client side and pass them to `send`:

```ts
function readFileAsDataUrl(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ name: file.name, type: file.type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

await chat.send("What is in this photo?", [await readFileAsDataUrl(file)]);
```

They render as `<img src={a.dataUrl} />` in bubbles and reach vision capable models upstream.

## 5. Reactions and edits

```ts
await chat.react(message.id, "🔥");     // toggles
await chat.edit(message.id, "new text"); // truncates after it and regenerates
```

The reference app shows a hover bar with a few emoji and an edit button that loads the message into the composer.

## 6. Sessions sidebar

Use `useSessions` for the list and `chat.open(id)` / `chat.reset()` for switching, as shown in [1.3](/projects/react). Persist ids in localStorage when running anonymously.
