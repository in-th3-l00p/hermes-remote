import { EXAMPLES } from "./examples/catalog.ts";
import { SitePage } from "./site.tsx";

export function Examples() {
  const [showcase, ...recipes] = EXAMPLES;
  if (showcase === undefined) {
    return null;
  }
  return (
    <SitePage current="/examples/">
      <section className="wrap page-intro">
        <h1 className="display">Examples</h1>
        <p className="lede">
          One complete app you can try right here, and recipes for the rest of the API. Everything
          is built on the published packages.
        </p>
      </section>

      <section className="wrap showcase" aria-labelledby="showcase">
        <h2 className="display" id="showcase">
          {showcase.title}
        </h2>
        <p className="prose">{showcase.blurb}</p>
        <p className="muted prose">
          It runs on sample data in your browser here, so there's no agent to connect. The same code
          talks to your server when you set one URL.
        </p>
        <div className="actions">
          <a className="button primary" href={`/examples/${showcase.slug}/app/`}>
            Open the chat app
          </a>
          <a className="button" href={`/examples/${showcase.slug}/`}>
            How it's built
          </a>
          <a
            className="button"
            href="https://github.com/in-th3-l00p/hermes-remote/tree/main/apps/chat"
          >
            Source on GitHub
          </a>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="recipes">
        <div className="section-head">
          <h2 className="display" id="recipes">
            Recipes
          </h2>
          <p>Short, copyable walkthroughs of one part of the API each.</p>
        </div>
        <dl className="defs">
          {recipes.map((recipe) => (
            <div key={recipe.slug}>
              <dt>
                <a href={`/examples/${recipe.slug}/`}>{recipe.title}</a>
              </dt>
              <dd>
                {recipe.blurb}{" "}
                <span className="tags">
                  {recipe.tags.map((tag) => (
                    <code key={tag}>{tag}</code>
                  ))}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </SitePage>
  );
}
