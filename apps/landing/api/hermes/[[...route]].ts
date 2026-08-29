import { vercelHandler } from "@in-th3-l00p/hermes-remote-examples-backend";

const handler = vercelHandler({
  ...(process.env["GROQ_API_KEY"] === undefined
    ? {}
    : { groqKey: process.env["GROQ_API_KEY"] }),
});

export function fetch(request: Request): Promise<Response> {
  return handler(request);
}
