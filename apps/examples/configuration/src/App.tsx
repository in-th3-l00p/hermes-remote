import { useState } from "react";
import { useConfig, useMemory, useSoul } from "@intheloop-studio/hermes-remote-react";
import { keyedClient } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

type Tab = "config" | "memory" | "soul";

function ConfigTab() {
  const config = useConfig({ client: keyedClient });
  const [key, setKey] = useState("model.name");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const run = async (action: "get" | "set" | "unset") => {
    try {
      const res =
        action === "get"
          ? await keyedClient.config.get(key)
          : action === "set"
            ? await keyedClient.config.set(key, value)
            : await keyedClient.config.unset(key);
      setResult(res.raw);
      await config.refresh();
    } catch (cause) {
      setResult(String(cause));
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="resolved config (hermes config show)">
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          {config.loading ? "…" : (config.data?.raw ?? "")}
        </pre>
        <ErrorNote error={config.error} />
      </Panel>
      <Panel title="get / set / unset">
        <label className="label">key</label>
        <input className="input" value={key} onChange={(e) => setKey(e.target.value)} />
        <label className="label">value</label>
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value for set"
        />
        <div className="flex gap-2">
          <button className="btn" onClick={() => void run("get")}>get</button>
          <button className="btn btn-primary" onClick={() => void run("set")}>set</button>
          <button className="btn" onClick={() => void run("unset")}>unset</button>
        </div>
        {result === null ? null : (
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
            {result}
          </pre>
        )}
      </Panel>
    </div>
  );
}

function Budget(props: { chars: number; limit: number }) {
  const pct = Math.min(100, Math.round((props.chars / props.limit) * 100));
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-zinc-800">
        <div
          className={pct > 90 ? "h-full bg-red-400" : "h-full bg-emerald-400"}
          style={{ width: `${pct}%` }}
        />
      </div>
      {props.chars}/{props.limit}
    </div>
  );
}

function MemoryTab() {
  const memory = useMemory({ client: keyedClient });
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await memory.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const lines = (memory.data?.content ?? "").split("\n").filter((l) => l !== "");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="MEMORY.md: the agent's notes">
        {memory.data === null ? null : (
          <Budget chars={memory.data.chars} limit={memory.data.limit} />
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start justify-between gap-2">
              <span className="text-zinc-300">{line}</span>
              <button
                className="text-xs text-zinc-600 hover:text-red-400"
                onClick={() => void act(() => keyedClient.memory.remove(line))}
              >
                remove
              </button>
            </li>
          ))}
          {lines.length === 0 ? (
            <li className="text-zinc-600">memory is empty</li>
          ) : null}
        </ul>
        <ErrorNote error={error ?? memory.error} />
      </Panel>
      <Panel title="add an entry">
        <p className="text-xs text-zinc-500">
          Entries append lines; overflow past the char budget is rejected by
          the server, forcing consolidation, exactly like the real agent.
        </p>
        <textarea
          className="input min-h-24"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="the visitor prefers dark mode…"
        />
        <button
          className="btn btn-primary self-start"
          onClick={() =>
            void act(async () => {
              await keyedClient.memory.add(entry.trim());
              setEntry("");
            })
          }
          disabled={entry.trim() === ""}
        >
          memory.add
        </button>
      </Panel>
    </div>
  );
}

function SoulTab() {
  const soul = useSoul({ client: keyedClient });
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const content = draft ?? soul.data?.content ?? "";

  return (
    <Panel
      title="SOUL.md: the agent's identity"
      actions={
        <button
          className="btn btn-primary"
          disabled={draft === null}
          onClick={() =>
            void keyedClient.soul
              .set(content)
              .then(() => soul.refresh())
              .then(() => setDraft(null))
              .catch((cause) => setError(String(cause)))
          }
        >
          save
        </button>
      }
    >
      <textarea
        className="input min-h-56 font-mono text-xs"
        value={soul.loading ? "…" : content}
        onChange={(e) => setDraft(e.target.value)}
      />
      <ErrorNote error={error ?? soul.error} />
    </Panel>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("config");
  return (
    <Shell
      title="configuration"
      slug="configuration"
      blurb="The agent's config, memory, and soul, edited through the CLI and filesystem bridges."
    >
      <div className="flex gap-2">
        {(["config", "memory", "soul"] as const).map((option) => (
          <button
            key={option}
            className={tab === option ? "btn btn-primary" : "btn"}
            onClick={() => setTab(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {tab === "config" ? <ConfigTab /> : tab === "memory" ? <MemoryTab /> : <SoulTab />}
    </Shell>
  );
}
