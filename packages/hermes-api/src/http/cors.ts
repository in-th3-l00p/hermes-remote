export function corsOrigin(
  origins: string[],
  request: Request,
): string | undefined {
  const requestOrigin = request.headers.get("origin");
  return requestOrigin !== null && origins.includes(requestOrigin)
    ? requestOrigin
    : origins[0];
}

export function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
      vary: "origin",
    },
  });
}

export function applyCors(response: Response, origin: string): void {
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("vary", "origin");
}
