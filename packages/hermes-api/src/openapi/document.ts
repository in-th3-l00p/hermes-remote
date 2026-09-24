import { z } from "zod";
import { MGMT_ROUTES, type CliRouteSpec } from "../mgmt/catalog.ts";
import { ROUTE_DOCS, type RouteDoc } from "./routes.ts";
import { CliResult, ErrorBody } from "./schemas.ts";

type Json = Record<string, unknown>;

/** Named sub-schemas collected while building, emitted as components. */
let components: Record<string, Json> = {};

/** Points `#/$defs/X` references at `#/components/schemas/X`. */
function relink(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(relink);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "$ref" && typeof inner === "string"
          ? inner.replace("#/$defs/", "#/components/schemas/")
          : relink(inner),
      ]),
    );
  }
  return value;
}

/**
 * JSON Schema for a zod schema, as OpenAPI 3.1 embeds it. Named schemas
 * (zod `.meta({ id })`) become shared components referenced by `$ref`.
 */
function schemaOf(schema: z.ZodType, io: "input" | "output"): Json {
  const {
    $schema: _drop,
    $defs,
    ...rest
  } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Json & {
    $defs?: Record<string, Json>;
  };
  for (const [name, def] of Object.entries($defs ?? {})) {
    components[name] = relink(def) as Json;
  }
  const id = z.globalRegistry.get(schema)?.id;
  if (id === undefined) {
    return relink(rest) as Json;
  }
  // Input and output shapes can differ (defaults, optionals), so name both.
  const name =
    io === "input" && JSON.stringify(schemaOfOutput(schema)) !== JSON.stringify(rest)
      ? `${id}Input`
      : id;
  components[name] = relink(rest) as Json;
  return { $ref: `#/components/schemas/${name}` };
}

function schemaOfOutput(schema: z.ZodType): Json {
  const {
    $schema: _drop,
    $defs: _defs,
    ...rest
  } = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as Json;
  return rest;
}

function catalogDoc(spec: CliRouteSpec): RouteDoc {
  const bodyParams = (spec.params ?? []).filter((p) => p.from === "body");
  const queryParams = (spec.params ?? []).filter((p) => p.from === "query");
  const body =
    bodyParams.length === 0
      ? undefined
      : z.object(
          Object.fromEntries(
            bodyParams.map((p) => [
              p.name,
              p.required === true
                ? z.union([z.string(), z.number(), z.boolean()])
                : z.union([z.string(), z.number(), z.boolean()]).optional(),
            ]),
          ),
        );
  return {
    tag: "Management",
    audience: "key",
    scope: spec.scope,
    summary:
      spec.unsupported === undefined
        ? `Runs \`hermes ${spec.argv.join(" ")}\``
        : `Not supported (501): ${spec.unsupported}`,
    ...(body === undefined ? {} : { body }),
    ...(queryParams.length === 0
      ? {}
      : {
          query: Object.fromEntries(
            queryParams.map((p) => [p.name, `Passed as ${p.flag ?? p.name}`]),
          ),
        }),
    response: "cli",
  };
}

/** Hono path → OpenAPI path plus its path parameters. */
function convertPath(path: string): { path: string; params: Json[] } {
  const params: Json[] = [];
  const converted = path
    .replace(/:(\w+)(\{((?:[^{}]|\{[^}]*\})*)\})?/g, (_m, name: string, _p, pattern?: string) => {
      params.push({
        name,
        in: "path",
        required: true,
        schema: {
          type: "string",
          ...(pattern === undefined ? {} : { pattern: `^(?:${pattern})$` }),
        },
      });
      return `{${name}}`;
    })
    .replace(/\/\*$/, () => {
      params.push({ name: "path", in: "path", required: true, schema: { type: "string" } });
      return "/{path}";
    });
  return { path: converted, params };
}

function responseBody(doc: RouteDoc): Json {
  const r = doc.response;
  if (r === "sse") {
    return { "text/event-stream": { schema: { type: "string" } } };
  }
  if (r === "archive") {
    return { "application/zip": { schema: { type: "string", format: "binary" } } };
  }
  if (r === "download") {
    return { "application/octet-stream": { schema: { type: "string", format: "binary" } } };
  }
  const schema =
    r === undefined ? { type: "object" } : schemaOf(r === "cli" ? CliResult : r, "output");
  return { "application/json": { schema } };
}

const error = (): Json => ({ "application/json": { schema: schemaOf(ErrorBody, "output") } });

function operation(method: string, path: string, doc: RouteDoc): Json {
  const { params } = convertPath(path);
  const query = Object.entries(doc.query ?? {}).map(([name, description]) => ({
    name,
    in: "query",
    required: false,
    description,
    schema: { type: "string" },
  }));
  const access = {
    public: "No token needed.",
    any: "Any authenticated caller.",
    "end-user": "API keys with the scope, user tokens and anonymous callers (own resources only).",
    key: "API keys only.",
  }[doc.audience];
  const responses: Json = {
    [String(doc.status ?? 200)]: { description: "Success", content: responseBody(doc) },
  };
  if (doc.body !== undefined || query.length > 0) {
    responses["400"] = { description: "Invalid request", content: error() };
  }
  if (doc.audience !== "public") {
    responses["401"] = { description: "Missing or invalid token", content: error() };
  }
  if (doc.audience !== "public" && doc.audience !== "any") {
    responses["403"] = { description: "Missing scope or wrong principal type", content: error() };
  }
  responses["default"] = { description: "Error", content: error() };
  return {
    operationId: `${method.toLowerCase()}${path.replace(/:(\w+)(\{((?:[^{}]|\{[^}]*\})*)\})?/g, "by-$1").replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ?? "").toUpperCase())}`,
    tags: [doc.tag],
    summary: doc.summary,
    description: `${access}${doc.scope === undefined ? "" : ` Scope: \`${doc.scope}\`.`}`,
    "x-hermes-scope": doc.scope ?? null,
    "x-hermes-audience": doc.audience,
    security: doc.audience === "public" ? [] : [{ bearer: [] }],
    parameters: [...params, ...query],
    ...(doc.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content:
              doc.body === "archive"
                ? { "application/octet-stream": { schema: { type: "string", format: "binary" } } }
                : { "application/json": { schema: schemaOf(doc.body, "input") } },
          },
        }),
    responses,
  };
}

/**
 * The OpenAPI 3.1 document for a set of registered routes. Every route
 * must be documented (in ROUTE_DOCS or the management catalog); an
 * undocumented one is an error, so the spec can't silently fall behind.
 */
export function buildOpenApi(routes: { method: string; path: string }[], version: string): Json {
  components = {};
  const catalog = new Map(
    MGMT_ROUTES.map((spec) => [`${spec.method.toUpperCase()} ${spec.path}`, spec]),
  );
  const paths: Record<string, Json> = {};
  const missing: string[] = [];
  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    const spec = catalog.get(key);
    const doc = ROUTE_DOCS[key] ?? (spec === undefined ? undefined : catalogDoc(spec));
    if (doc === undefined) {
      missing.push(key);
      continue;
    }
    const openPath = convertPath(path).path;
    paths[openPath] = { ...paths[openPath], [method.toLowerCase()]: operation(method, path, doc) };
  }
  if (missing.length > 0) {
    throw new Error(`undocumented routes: ${missing.join(", ")}`);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Hermes Remote API",
      version,
      description:
        "The authenticated web API in front of a Hermes agent. Errors always use the Error schema.",
    },
    components: {
      schemas: components,
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "An hk_ API key, a user JWT, or a token-exchange token",
        },
      },
    },
    paths,
  };
}
