import { useMemo, useState } from "react";
import type { HermesClient } from "@intheloop-studio/hermes-remote-client";
import {
  useAgentStatus,
  useMemory,
  useProfiles,
  useSoul,
} from "@intheloop-studio/hermes-remote-react";
import { keyedClient } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

interface ProfileRow {
  name: string;
  isDefault: boolean;
  model: string | null;
  gateway: string | null;
}

function ProfilePanels(props: { client: HermesClient; profile: string }) {
  const soul = useSoul({ client: props.client });
  const memory = useMemory({ client: props.client });
  const status = useAgentStatus({ client: props.client });
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title={`SOUL.md · ${props.profile}`}>
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          {soul.loading ? "…" : soul.data?.content}
        </pre>
        <ErrorNote error={soul.error} />
      </Panel>
      <Panel title={`MEMORY.md · ${props.profile}`}>
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          {memory.loading ? "…" : memory.data?.content}
        </pre>
        <ErrorNote error={memory.error} />
      </Panel>
      <Panel title={`status · ${props.profile}`}>
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          {status.loading ? "…" : status.data?.raw}
        </pre>
        <ErrorNote error={status.error} />
      </Panel>
    </div>
  );
}

export default function App() {
  const profiles = useProfiles({ client: keyedClient });
  const [selected, setSelected] = useState("default");
  const scoped = useMemo(() => keyedClient.withProfile(selected), [selected]);
  const rows = (profiles.data ?? []) as ProfileRow[];

  return (
    <Shell
      title="profiles"
      slug="profiles"
      blurb="Isolated agent instances behind one server. One header switches everything."
    >
      <Panel title="profiles (hermes profile list)">
        <div className="flex flex-wrap gap-2">
          {rows.map((profile) => (
            <button
              key={profile.name}
              className={
                selected === profile.name ? "btn btn-primary" : "btn"
              }
              onClick={() => setSelected(profile.name)}
            >
              {profile.name}
              {profile.isDefault ? " ◆" : ""}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Selecting a profile rebuilds the client with{" "}
          <code className="font-mono">withProfile("{selected}")</code>, so every
          request below now carries{" "}
          <code className="font-mono">X-Hermes-Profile: {selected}</code>.
        </p>
        <ErrorNote error={profiles.error} />
      </Panel>
      <ProfilePanels client={scoped} profile={selected} key={selected} />
    </Shell>
  );
}
