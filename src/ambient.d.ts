// Minimal ambient typings for the Workers TCP Sockets API, used for raw SMTP.
// (Kept local instead of relying on @cloudflare/workers-types shipping it.)
declare module "cloudflare:sockets" {
  export interface SocketOptions {
    secureTransport?: "off" | "on" | "starttls";
    allowHalfOpen?: boolean;
  }

  export interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    closed: Promise<void>;
    close(): Promise<void>;
    /** Upgrades a socket opened with secureTransport: "starttls" to TLS. Synchronous. */
    startTls(): Socket;
  }

  export function connect(
    address: string | { hostname: string; port: number },
    options?: SocketOptions
  ): Socket;
}
