import type { ReactNode } from "react";

export function CodeCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/50 text-muted-foreground flex items-center justify-between border-b px-4 py-2 font-mono text-xs">
        <span>{title}</span>
        <span>✧</span>
      </div>
      <pre className="bg-card overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

export function Comment({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function SiteNav() {
  return (
    <div className="border-b">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <a href="/" className="text-sm font-semibold">
          ✧ hermes<span className="text-muted-foreground">remote</span>
        </a>
        <div className="flex items-center gap-5 text-sm">
          <a
            href="/docs/"
            className="text-muted-foreground hover:text-foreground"
          >
            Docs
          </a>
          <a
            href="/examples/"
            className="text-muted-foreground hover:text-foreground"
          >
            Examples
          </a>
          <a
            href="https://github.com/in-th3-l00p/hermes-remote"
            className="text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href="https://hermes-agent.nousresearch.com"
            className="text-muted-foreground hover:text-foreground"
          >
            Hermes Agent
          </a>
        </div>
      </nav>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground mt-16 border-t py-8 text-center text-sm">
      <a href="https://www.tiscacatalin.com">✧ tiscacatalin.com ✧</a>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
