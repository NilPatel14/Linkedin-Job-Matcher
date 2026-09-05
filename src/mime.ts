/**
 * RFC 5322 / 2045 message construction, kept free of any socket dependency so
 * it can be exercised on its own.
 */

export const CRLF = "\r\n";

const encoder = new TextEncoder();

export interface Attachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  /** Message body. Treated as HTML unless contentType says otherwise. */
  body: string;
  contentType?: "text/html" | "text/plain";
  /** Files to attach. Any present switches the message to multipart/mixed. */
  attachments?: Attachment[];
}

export function base64(bytes: Uint8Array): string {
  // Chunked so a multi-megabyte attachment doesn't exceed the argument limit of
  // String.fromCharCode, or build the binary string one character at a time.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Base64 payloads must be wrapped; RFC 2045 caps encoded lines at 76 chars. */
function wrapBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

/**
 * RFC 2047 encoding for header values containing non-ASCII (e.g. an em dash in
 * a subject line). Split into <=75 char encoded-words on UTF-8 boundaries.
 */
export function encodeHeader(value: string): string {
  if (!/[^\x20-\x7E]/.test(value)) return value;

  const bytes = encoder.encode(value);
  const words: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 45, bytes.length);
    // Don't split in the middle of a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    words.push(`=?UTF-8?B?${base64(bytes.slice(start, end))}?=`);
    start = end;
  }
  return words.join(`${CRLF} `);
}

/** Builds the full message, as multipart/mixed when files are attached. */
export function buildMessage(msg: MailMessage): string {
  const bodyType = msg.contentType || "text/html";
  const attachments = msg.attachments || [];
  const headers = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
  ];

  if (attachments.length === 0) {
    headers.push(`Content-Type: ${bodyType}; charset=UTF-8`);
    // Normalize to CRLF line endings, then dot-stuff leading dots (RFC 5321).
    const normalized = msg.body.replace(/\r\n/g, "\n").replace(/\n/g, CRLF);
    return `${headers.join(CRLF)}${CRLF}${CRLF}${normalized.replace(/^\./gm, "..")}`;
  }

  const boundary = `----jobmatcher_${crypto.randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  // Every part is base64-encoded, so no line can begin with "." and dot-stuffing
  // the assembled payload is unnecessary.
  const parts = [
    [
      `--${boundary}`,
      `Content-Type: ${bodyType}; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      wrapBase64(base64(encoder.encode(msg.body))),
    ].join(CRLF),
  ];

  for (const a of attachments) {
    const name = encodeHeader(a.filename.replace(/["\r\n]/g, ""));
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${a.contentType}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        wrapBase64(base64(a.content)),
      ].join(CRLF)
    );
  }

  parts.push(`--${boundary}--`);
  return `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join(CRLF)}`;
}
