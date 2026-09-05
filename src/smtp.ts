import { connect, Socket } from "cloudflare:sockets";
import { buildMessage, CRLF, MailMessage } from "./mime";

export type { Attachment, MailMessage } from "./mime";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = implicit TLS (port 465). false = STARTTLS (port 587/25). */
  secure: boolean;
  user: string;
  pass: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readReply(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("SMTP server closed the connection unexpectedly");
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(CRLF).filter((l) => l.length > 0);
    const last = lines[lines.length - 1];
    // A final reply line has a space after the 3-digit code; "-" means more lines follow.
    if (last && /^\d{3} /.test(last)) return buffer;
  }
}

function replyCode(reply: string): number {
  const lines = reply.trim().split(CRLF);
  return Number(lines[lines.length - 1].slice(0, 3));
}

async function writeLine(writer: WritableStreamDefaultWriter<Uint8Array>, line: string): Promise<void> {
  await writer.write(encoder.encode(line + CRLF));
}

/** Attachments make the payload large; feed it to the socket in slices. */
async function writeChunked(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  payload: string
): Promise<void> {
  const bytes = encoder.encode(payload);
  const CHUNK = 64 * 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await writer.write(bytes.subarray(i, i + CHUNK));
  }
}

async function expect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  wantCode: number,
  step: string
): Promise<string> {
  const reply = await readReply(reader);
  if (replyCode(reply) !== wantCode) {
    throw new Error(`SMTP step "${step}" failed, expected ${wantCode}, got: ${reply.trim()}`);
  }
  return reply;
}

/** Minimal SMTP client (EHLO/AUTH LOGIN/MAIL/RCPT/DATA) over a raw TCP socket. */
export async function sendMail(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  let socket: Socket = connect(
    { hostname: cfg.host, port: cfg.port },
    { secureTransport: cfg.secure ? "on" : "starttls" }
  );
  let writer = socket.writable.getWriter();
  let reader = socket.readable.getReader();

  try {
    await expect(reader, 220, "connect");

    await writeLine(writer, "EHLO workers.dev");
    await expect(reader, 250, "EHLO");

    if (!cfg.secure) {
      await writeLine(writer, "STARTTLS");
      await expect(reader, 220, "STARTTLS");

      writer.releaseLock();
      reader.releaseLock();
      socket = socket.startTls();
      writer = socket.writable.getWriter();
      reader = socket.readable.getReader();

      await writeLine(writer, "EHLO workers.dev");
      await expect(reader, 250, "EHLO (TLS)");
    }

    await writeLine(writer, "AUTH LOGIN");
    await expect(reader, 334, "AUTH LOGIN");

    await writeLine(writer, btoa(cfg.user));
    await expect(reader, 334, "AUTH username");

    await writeLine(writer, btoa(cfg.pass));
    await expect(reader, 235, "AUTH password");

    await writeLine(writer, `MAIL FROM:<${msg.from}>`);
    await expect(reader, 250, "MAIL FROM");

    await writeLine(writer, `RCPT TO:<${msg.to}>`);
    await expect(reader, 250, "RCPT TO");

    await writeLine(writer, "DATA");
    await expect(reader, 354, "DATA");

    // "\r\n.\r\n" terminates the DATA block.
    await writeChunked(writer, `${buildMessage(msg)}${CRLF}.${CRLF}`);
    await expect(reader, 250, "message body");

    await writeLine(writer, "QUIT");
  } catch (err) {
    const message = (err as Error).message;
    // Socket-level failures surface as opaque stream errors; name the endpoint.
    throw message.startsWith("SMTP step")
      ? err
      : new Error(`Could not complete SMTP session with ${cfg.host}:${cfg.port} — ${message}`);
  } finally {
    try {
      writer.releaseLock();
    } catch {
      /* already released */
    }
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
    await socket.close().catch(() => {});
  }
}
