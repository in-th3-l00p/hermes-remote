import { Page } from "./layout.tsx";
import { EXAMPLES } from "./examples/catalog.ts";

export function Examples() {
  return (
    <Page>
      <section className="pt-20">
        <h1 className="text-3xl font-semibold tracking-tight">Examples</h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
          Six small apps, each built on the published packages. They run on
          built-in demo data, so you can click around without a server, then
          read how each one is put together.
        </p>
        <div className="mt-14 space-y-12">
          {EXAMPLES.map((example) => (
            <article key={example.slug} className="max-w-xl">
              <h2 className="font-mono text-sm">
                <span className="text-brand">/</span>
                {example.slug}
              </h2>
              <p className="mt-2 leading-relaxed">
                <span className="font-medium">{example.title}.</span>{" "}
                <span className="text-muted-foreground">{example.blurb}</span>
              </p>
              <p className="mt-3 flex gap-6 font-mono text-sm">
                <a
                  href={`/examples/${example.slug}/app/`}
                  className="text-brand hover:underline underline-offset-4"
                >
                  open the app
                </a>
                <a
                  href={`/examples/${example.slug}/`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  how it is built
                </a>
              </p>
            </article>
          ))}
        </div>
      </section>
    </Page>
  );
}
