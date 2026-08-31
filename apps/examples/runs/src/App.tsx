import { useState } from "react";
import { useRunEvents, useRuns } from "@intheloop-studio/hermes-remote-react";
import { client } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

export default function App() {
  const runs = useRuns({ client });
  const [task, setTask] = useState("");
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const events = useRunEvents({ client, runId: activeRun });

  const submit = async () => {
    const input = task.trim();
    if (input === "") {
      return;
    }
    setTask("");
    setOutput(null);
    const created = (await runs.create({ input })) as { id?: string } | null;
    if (created?.id !== undefined) {
      setActiveRun(created.id);
    }
  };

  const inspect = async (id: string) => {
    setActiveRun(id);
    const run = (await client.runs.get(id)) as { output?: string };
    setOutput(run.output ?? null);
  };

  return (
    <Shell
      title="runs"
      slug="runs"
      blurb="Long-running agent tasks with live event streams and per-visitor ownership."
    >
      <Panel title="submit a task">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="input"
            placeholder="e.g. write a haiku about SSE streams"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <button className="btn btn-primary" disabled={runs.loading}>
            runs.create
          </button>
        </form>
        <ErrorNote error={runs.error} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Panel
          title="your runs"
          actions={
            <button className="btn btn-ghost" onClick={() => void runs.refresh()}>
              refresh
            </button>
          }
        >
          <ul className="flex flex-col gap-1 text-sm">
            {runs.runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-2">
                <button
                  className={
                    "truncate text-left font-mono text-xs hover:text-white " +
                    (run.id === activeRun ? "text-white" : "text-zinc-400")
                  }
                  onClick={() => void inspect(run.id)}
                >
                  {run.id}
                </button>
                <button
                  className="text-xs text-zinc-600 hover:text-red-400"
                  onClick={() => void client.runs.stop(run.id).then(() => runs.refresh())}
                >
                  stop
                </button>
              </li>
            ))}
            {runs.runs.length === 0 ? (
              <li className="text-zinc-600">no runs yet. submit a task</li>
            ) : null}
          </ul>
          <p className="text-xs text-zinc-600">
            Anonymous visitors only ever see runs they created; ownership is
            tracked per principal on the server.
          </p>
        </Panel>
        <Panel title={activeRun === null ? "event stream" : `events · ${activeRun}`}>
          <ul className="flex min-h-40 flex-col gap-1 font-mono text-xs">
            {events.events.map((event, index) => (
              <li key={index}>
                <span className="text-emerald-400">{event.event}</span>{" "}
                <span className="text-zinc-400">
                  {JSON.stringify(event.data)}
                </span>
              </li>
            ))}
            {events.done ? <li className="text-zinc-500">stream closed</li> : null}
            {activeRun === null ? (
              <li className="text-zinc-600">select or create a run</li>
            ) : null}
          </ul>
          <ErrorNote error={events.error} />
          {output === null ? null : (
            <>
              <p className="label">final output</p>
              <p className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-sm text-zinc-200">
                {output}
              </p>
            </>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
