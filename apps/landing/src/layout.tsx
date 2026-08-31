import type { ReactNode } from "react";

export function Code({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-white/[0.03] px-5 py-4 font-mono text-[13px] leading-relaxed">
      {children}
    </pre>
  );
}

export function Comment({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function Prompt({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="text-brand select-none">$ </span>
      {children}
    </>
  );
}

export function Out({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

const NAV_LINKS = [
  { href: "/docs/", label: "docs" },
  { href: "/examples/", label: "examples" },
  { href: "https://github.com/in-th3-l00p/hermes-remote", label: "github" },
  { href: "https://hermes-agent.nousresearch.com", label: "hermes agent" },
];

export function SiteNav() {
  return (
    <nav className="mx-auto flex max-w-2xl items-baseline justify-between px-6 pt-8 font-mono text-sm">
      <a href="/" className="text-foreground">
        hermes<span className="text-muted-foreground">-remote</span>
      </a>
      <div className="flex items-baseline gap-4">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-2xl px-6 pt-20 pb-10 font-mono text-xs text-muted-foreground">
      <a href="https://www.tiscacatalin.com" className="hover:text-foreground">
        tiscacatalin.com
      </a>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
