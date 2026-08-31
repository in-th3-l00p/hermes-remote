import { useState } from "react";
import {
  useAgentInfo,
  useChat,
  useConfig,
  useEvents,
  useJobsAdmin,
  useMemory,
  useRunEvents,
  useRuns,
  useSoul,
} from "@intheloop-studio/hermes-remote-react";
import { client, keyedClient } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

function ChatPane() {
  const chat = useChat({ client });
  const [draft, setDraft] = useState("");
  return (
    <Panel
      title="chat"
      actions={
        chat.streaming ? (
          <button className="btn" onClick={() => void chat.stop()}>
            stop
          </button>
        ) : undefined
      }
    >
      <div className="flex max-h-64 min-h-40 flex-col gap-1 overflow-y-auto text-sm">
        {chat.messages.map((m) => (
          <p key={m.id} className={m.role === "user" ? "text-zinc-100" : "text-zinc-400"}>
            <span className="label mr-2">{m.role}</span>
            {m.content}
            {m.status === "streaming" ? "▍" : ""}
          </p>
        ))}
        {chat.messages.length === 0 ? (
          <p className="m-auto text-xs text-zinc-600">talk to your agent</p>
        ) : null}
      </div>
      <ErrorNote error={chat.error} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const content = draft.trim();
          if (content !== "" && !chat.streaming) {
            setDraft("");
            void chat.send(content);
          }
        }}
      >
        <input
          className="input"
          value={draft}
          placeholder="message…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-primary" disabled={chat.streaming}>
          send
        </button>
      </form>
    </Panel>
  );
}

function RunsPane() {
  const runs = useRuns({ client });
  const [task, setTask] = useState("");
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const events = useRunEvents({ client, runId: activeRun });
  return (
    <Panel title="runs">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = task.trim();
          if (input === "") {
            return;
          }
          setTask("");
          void runs
            .create({ input })
            .then((created) =>
              setActiveRun((created as { id?: string } | null)?.id ?? null),
            );
        }}
      >
        <input
          className="input"
          value={task}
          placeholder="launch an agent task…"
          onChange={(e) => setTask(e.target.value)}
        />
        <button className="btn btn-primary">run</button>
      </form>
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {runs.runs.slice(0, 4).map((run) => (
          <li key={run.id}>
            <button
              className={run.id === activeRun ? "text-white" : "text-zinc-500 hover:text-zinc-300"}
              onClick={() => setActiveRun(run.id)}
            >
              {run.id}
            </button>
          </li>
        ))}
      </ul>
      <div className="max-h-32 overflow-y-auto font-mono text-xs text-zinc-400">
        {events.events.map((event, index) => (
          <p key={index}>
            <span className="text-emerald-400">{event.event}</span>{" "}
            {JSON.stringify(event.data).slice(0, 120)}
          </p>
        ))}
      </div>
      <ErrorNote error={runs.error ?? events.error} />
    </Panel>
  );
}

function MemorySoulPane() {
  const memory = useMemory({ client: keyedClient });
  const soul = useSoul({ client: keyedClient });
  const [entry, setEntry] = useState("");
  return (
    <Panel title="memory + soul">
      <p className="label">SOUL.md</p>
      <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-2 font-mono text-xs text-zinc-400">
        {soul.data?.content ?? "…"}
      </pre>
      <p className="label">
        MEMORY.md · {memory.data?.chars ?? 0}/{memory.data?.limit ?? 2200}
      </p>
      <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-2 font-mono text-xs text-zinc-400">
        {memory.data?.content ?? "…"}
      </pre>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = entry.trim();
          if (text !== "") {
            setEntry("");
            void keyedClient.memory.add(text).then(() => memory.refresh());
          }
        }}
      >
        <input
          className="input"
          value={entry}
          placeholder="remember something…"
          onChange={(e) => setEntry(e.target.value)}
        />
        <button className="btn">add</button>
      </form>
      <ErrorNote error={memory.error ?? soul.error} />
    </Panel>
  );
}

function OpsPane() {
  const info = useAgentInfo({ client: keyedClient });
  const config = useConfig({ client: keyedClient });
  const jobs = useJobsAdmin({ client: keyedClient });
  const health = info.health as { status?: string; upstream?: { model?: string } } | null;
  const jobList =
    (jobs.data as { jobs?: { name: string; schedule?: string }[] } | null)?.jobs ?? [];
  return (
    <Panel title="health · config · jobs">
      <p className="text-sm">
        <span
          className={
            health?.status === "ok" ? "text-emerald-400" : "text-amber-400"
          }
        >
          ● {health?.status ?? "…"}
        </span>{" "}
        <span className="text-zinc-500">
          model {health?.upstream?.model ?? "…"}
        </span>
      </p>
      <p className="label">cron jobs</p>
      <ul className="text-xs text-zinc-400">
        {jobList.map((job) => (
          <li key={job.name}>
            {job.name} <span className="text-zinc-600">{job.schedule}</span>
          </li>
        ))}
      </ul>
      <p className="label">config</p>
      <pre className="max-h-28 overflow-y-auto rounded-lg bg-zinc-950 p-2 font-mono text-xs text-zinc-400">
        {config.data?.raw ?? "…"}
      </pre>
      <ErrorNote error={info.error ?? config.error ?? jobs.error} />
    </Panel>
  );
}

function EventsTicker() {
  const events = useEvents({ client: keyedClient });
  return (
    <Panel title={`event firehose ${events.connected ? "· live" : ""}`}>
      <div className="max-h-40 overflow-y-auto font-mono text-xs">
        {events.events
          .slice(-30)
          .reverse()
          .map((event, index) => (
            <p key={index} className="text-zinc-400">
              <span className="text-sky-400">{event.event}</span>{" "}
              {JSON.stringify(event.data).slice(0, 110)}
            </p>
          ))}
        {events.events.length === 0 ? (
          <p className="text-zinc-600">
            waiting for lifecycle events: send a message or launch a run
          </p>
        ) : null}
      </div>
      <ErrorNote error={events.error} />
    </Panel>
  );
}

export default function App() {
  return (
    <Shell
      title="command center"
      slug="command-center"
      blurb="Every surface at once: chat, runs, memory, soul, config, health, and the live event stream."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <ChatPane />
        <RunsPane />
        <MemorySoulPane />
        <OpsPane />
      </div>
      <EventsTicker />
    </Shell>
  );
}
