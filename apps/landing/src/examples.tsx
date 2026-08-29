import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Page } from "./layout.tsx";
import { EXAMPLES } from "./examples/catalog.ts";

export function Examples() {
  return (
    <Page>
      <section className="py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Examples</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Every example is a live app running against a real hermes-remote
          sandbox on a free fast model — open the demo to try it, or read the
          architecture to see how it is built.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <Card key={example.slug} className="flex flex-col justify-between">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{example.title}</h2>
                  <span className="text-muted-foreground font-mono text-xs">
                    /{example.slug}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">{example.blurb}</p>
                <div className="flex flex-wrap gap-1.5">
                  {example.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto flex gap-2 pt-2">
                  <a
                    href={`/examples/${example.slug}/app/`}
                    className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
                  >
                    Open live demo
                  </a>
                  <a
                    href={`/examples/${example.slug}/`}
                    className="border-input rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Read the architecture
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </Page>
  );
}
