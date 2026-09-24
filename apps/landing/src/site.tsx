import type { ReactNode } from "react";

/** The four-point star from the Hermes Remote mark. */
export function StarMark() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M64 8 C68 40 88 60 120 64 C88 68 68 88 64 120 C60 88 40 68 8 64 C40 60 60 40 64 8 Z"
      />
    </svg>
  );
}

const NAV = [
  { href: "/docs/", label: "Docs" },
  { href: "/examples/", label: "Examples" },
  { href: "https://github.com/in-th3-l00p/hermes-remote", label: "GitHub" },
];

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="wrap site-header">
      <a className="wordmark" href="/">
        <StarMark />
        hermes remote
      </a>
      <nav className="site-nav" aria-label="Site">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            {...(current === item.href ? { "aria-current": "page" as const } : {})}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="wrap site-footer">
      <span>
        MIT licensed. Built for the{" "}
        <a href="https://hermes-agent.nousresearch.com">Hermes agent</a> by Nous Research.
      </span>
      <nav className="footer-links" aria-label="Elsewhere">
        <a href="https://github.com/in-th3-l00p/hermes-remote/releases">Releases</a>
        <a href="https://www.npmjs.com/org/intheloop-studio">npm packages</a>
        <a href="https://www.tiscacatalin.com">Tisca Catalin</a>
      </nav>
    </footer>
  );
}

export function SitePage({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader {...(current === undefined ? {} : { current })} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
