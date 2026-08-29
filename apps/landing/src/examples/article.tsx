import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import { Page } from "../layout.tsx";
import { EXAMPLES } from "./catalog.ts";
import "../index.css";

export function Article(props: { slug: string; markdown: string }) {
  const card = EXAMPLES.find((e) => e.slug === props.slug);
  return (
    <Page>
      <article className="py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            <a href="/examples/" className="hover:text-foreground">
              examples
            </a>{" "}
            / {props.slug}
          </p>
          <a
            href={`/examples/${props.slug}/app/`}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Open the live demo
          </a>
        </div>
        <div className="space-y-4 text-[15px] leading-relaxed">
          <Markdown
            components={{
              h1: (p) => (
                <h1 className="text-3xl font-semibold tracking-tight" {...p} />
              ),
              h2: (p) => (
                <h2
                  className="mt-10 border-b pb-2 text-xl font-semibold tracking-tight"
                  {...p}
                />
              ),
              h3: (p) => (
                <h3 className="mt-6 text-lg font-semibold" {...p} />
              ),
              p: (p) => <p className="text-muted-foreground" {...p} />,
              li: (p) => <li className="text-muted-foreground" {...p} />,
              ul: (p) => <ul className="list-disc space-y-1 pl-6" {...p} />,
              ol: (p) => <ol className="list-decimal space-y-1 pl-6" {...p} />,
              a: (p) => (
                <a className="text-foreground underline" {...p} />
              ),
              strong: (p) => <strong className="text-foreground" {...p} />,
              pre: (p) => (
                <pre
                  className="bg-card overflow-x-auto rounded-xl border p-4 font-mono text-[13px] leading-relaxed"
                  {...p}
                />
              ),
              code: (p) => <code className="font-mono text-[13px]" {...p} />,
              table: (p) => (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" {...p} />
                </div>
              ),
              th: (p) => (
                <th className="border-b px-2 py-1 font-medium" {...p} />
              ),
              td: (p) => (
                <td className="text-muted-foreground border-b px-2 py-1" {...p} />
              ),
            }}
          >
            {props.markdown}
          </Markdown>
        </div>
        {card === undefined ? null : (
          <p className="text-muted-foreground mt-10 border-t pt-6 text-sm">
            Source:{" "}
            <a
              className="underline hover:text-foreground"
              href={`https://github.com/in-th3-l00p/hermes-remote/tree/main/apps/examples/${props.slug}`}
            >
              apps/examples/{props.slug}
            </a>
          </p>
        )}
      </article>
    </Page>
  );
}

export function mountArticle(slug: string, markdown: string): void {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <Article slug={slug} markdown={markdown} />,
  );
}
