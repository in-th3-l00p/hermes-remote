import type { Attachment, AttachmentType } from "@intheloop-studio/hermes-remote-react";

export const ACCEPTED_TYPES: readonly AttachmentType[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

function isAccepted(type: string): type is AttachmentType {
  return (ACCEPTED_TYPES as readonly string[]).includes(type);
}

/** Reads an image as a data URL attachment; other types are refused. */
export function readAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const type = file.type;
    if (!isAccepted(type)) {
      reject(new Error(`${file.name} isn't a PNG, JPEG, GIF or WebP image`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`${file.name} couldn't be read`));
    reader.readAsDataURL(file);
  });
}
