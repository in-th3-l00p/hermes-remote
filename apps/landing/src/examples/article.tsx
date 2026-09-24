import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import { SitePage } from "../site.tsx";
import { EXAMPLES } from "./catalog.ts";
import "../site.css";

export function Article(props: { slug: string; markdown: string }) {
  const card = EXAMPLES.find((e) => e.slug === props.slug);
  return (
    <SitePage current="/examples/">
      <article className="wrap article">
        <p className="crumbs">
          <a href="/examples/">Examples</a>
        </p>
        {card?.live === true && (
          <p className="actions">
            <a className="button primary" href={`/examples/${props.slug}/app/`}>
              Open the app
            </a>
          </p>
        )}
        <Markdown>{props.markdown}</Markdown>
      </article>
    </SitePage>
  );
}

export function mountArticle(slug: string, markdown: string): void {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <Article slug={slug} markdown={markdown} />,
  );
}
