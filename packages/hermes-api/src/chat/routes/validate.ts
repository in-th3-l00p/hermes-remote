import type { Attachment } from "../store/index.ts";
import type { Limits } from "../../limits/index.ts";

export interface SendBody {
  content?: unknown;
  attachments?: unknown;
}

export function parseAttachments(raw: unknown, limits: Limits): Attachment[] | null {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || raw.length > limits.maxAttachments) {
    return null;
  }
  const attachments: Attachment[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (
      typeof item?.["name"] !== "string" ||
      typeof item?.["type"] !== "string" ||
      typeof item?.["dataUrl"] !== "string" ||
      item["dataUrl"].length > limits.maxAttachmentChars
    ) {
      return null;
    }
    attachments.push({
      name: item["name"],
      type: item["type"],
      dataUrl: item["dataUrl"],
    });
  }
  return attachments;
}

export function pageParams(
  url: URL,
  defaultLimit: number,
): { limit: number; offset: number } {
  const limit = Number(url.searchParams.get("limit") ?? String(defaultLimit));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : defaultLimit,
    offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
  };
}
