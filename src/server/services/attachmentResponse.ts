/** Only raster formats are previewable. Never use the uploader's MIME type to serve bytes. */
function previewType(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return "image/gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** `head` is the file's first bytes (16 suffice to recognize a preview type); `size` the whole length. */
export function attachmentHeaders(head: Uint8Array, size: number, name: string, download: boolean): Record<string, string> {
  const mime = previewType(head);
  return {
    "Content-Type": mime ?? "application/octet-stream",
    "Content-Length": String(size),
    // Every retrieval must pass current authorization, including after membership revocation.
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${mime && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
    "X-Content-Type-Options": "nosniff",
    // Signatures are not full image validation. Constrain even malformed/polyglot responses
    // to an opaque origin with no script, navigation, forms, or external resource privileges.
    "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
  };
}
