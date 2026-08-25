export interface SseEvent {
  event: string;
  data: unknown;
}

function field(line: string, name: string): string | null {
  if (!line.startsWith(`${name}:`)) {
    return null;
  }
  const value = line.slice(name.length + 1);
  return value.startsWith(" ") ? value.slice(1) : value;
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    const name = field(line, "event");
    if (name !== null) {
      event = name;
      continue;
    }
    const payload = field(line, "data");
    if (payload !== null) {
      data.push(payload);
    }
  }
  if (data.length === 0) {
    return null;
  }
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    // A malformed payload (e.g. a non-JSON keepalive) must not kill the stream.
    return null;
  }
}

export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let carry = "";
  let first = true;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let text = carry + decoder.decode(value, { stream: true });
      if (first) {
        text = text.replace(/^\uFEFF/, "");
        first = false;
      }
      // A trailing \r may pair with a \n in the next chunk; hold it back so
      // one CRLF never normalizes into two newlines.
      carry = text.endsWith("\r") ? "\r" : "";
      if (carry !== "") {
        text = text.slice(0, -1);
      }
      buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() as string;
      for (const block of blocks) {
        const parsed = parseBlock(block);
        if (parsed !== null) {
          yield parsed;
        }
      }
    }
  } finally {
    // Runs on consumer break/return too: close the connection instead of
    // leaving the fetch body locked.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
