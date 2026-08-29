import type { ReactNode } from "react";

export function Shell(props: {
  title: string;
  slug: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {props.title}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              hermes remote examples
            </span>
          </h1>
          <p className="text-sm text-zinc-400">{props.blurb}</p>
        </div>
        <nav className="flex gap-2">
          <a className="btn btn-ghost" href={`/examples/${props.slug}/`}>
            architecture
          </a>
          <a className="btn btn-ghost" href="/examples/">
            all examples
          </a>
        </nav>
      </header>
      <SandboxBanner />
      <main className="flex flex-1 flex-col gap-4">{props.children}</main>
    </div>
  );
}

export function SandboxBanner() {
  return (
    <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200/90">
      Live sandbox — a real hermes-remote server on a free fast model. Shared
      state, tight rate limits, resets periodically. Be nice.
    </p>
  );
}

export function Panel(props: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label">{props.title}</h2>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function ErrorNote(props: { error: string | null }) {
  if (props.error === null) {
    return null;
  }
  return (
    <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
      {props.error}
    </p>
  );
}
