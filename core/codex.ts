// A minimal client for `codex app-server` (JSON-RPC, one message per line). The process is the
// host's business (Swift in the app, the dev server in `pnpm dev`, a child process in tests);
// this only needs a way to send a line and a stream of the lines it prints. Using the user's
// own Codex means annotation runs on their ChatGPT plan's quota, with their model settings.

export interface LineTransport {
  send(line: string): void;
  onLine(cb: (line: string) => void): void;
}

export interface RateWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}
export interface RateLimits {
  primary: RateWindow | null;
  secondary: RateWindow | null;
}
export type CodexAccount = { type: "chatgpt"; email: string | null; planType: string } | { type: "apiKey" } | { type: string };

export interface DynamicTool {
  name: string;
  description: string;
  inputSchema: unknown;
  /** Returns the text the agent sees; `ok: false` marks the call as failed so it retries */
  run(args: unknown): Promise<{ ok: boolean; text: string }> | { ok: boolean; text: string };
}

type Notification = { method: string; params: Record<string, unknown> };

export class CodexClient {
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners: ((n: Notification) => void)[] = [];
  private tools = new Map<string, DynamicTool>();
  private transport: LineTransport;

  constructor(transport: LineTransport) {
    this.transport = transport;
    transport.onLine((line) => this.receive(line));
  }

  request<T = Record<string, unknown>>(method: string, params: unknown = {}): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.transport.send(JSON.stringify({ id, method, params }));
    });
  }

  notify(method: string, params?: unknown) {
    this.transport.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  /** Notifications from the server (turn/completed, item/completed, account/rateLimits/updated…) */
  on(cb: (n: Notification) => void): () => void {
    this.listeners.push(cb);
    return () => (this.listeners = this.listeners.filter((l) => l !== cb));
  }

  /** Answer `item/tool/call` for these tools (they are declared per thread in `thread/start`). */
  provide(tools: DynamicTool[]) {
    for (const t of tools) this.tools.set(t.name, t);
  }

  /** Fail every request still waiting, e.g. when the process exits. */
  close(reason: string) {
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
  }

  async initialize(clientInfo: { name: string; title: string; version: string }) {
    const r = await this.request<{ userAgent: string }>("initialize", { clientInfo, capabilities: { experimentalApi: true, requestAttestation: false } });
    this.notify("initialized");
    return r;
  }

  private receive(line: string) {
    let m: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };
    try {
      m = JSON.parse(line);
    } catch {
      return; // not protocol output
    }
    if (m.id !== undefined && !m.method) {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      if (m.error) p?.reject(new Error(m.error.message));
      else p?.resolve(m.result);
    } else if (m.id !== undefined && m.method) void this.serve(m.id, m.method, m.params ?? {});
    else if (m.method) for (const l of this.listeners) l({ method: m.method, params: m.params ?? {} });
  }

  // requests the server makes of us: our tools; anything needing approval is declined
  private async serve(id: number, method: string, params: Record<string, unknown>) {
    const reply = (result: unknown) => this.transport.send(JSON.stringify({ id, result }));
    if (method !== "item/tool/call") {
      if (method.endsWith("requestApproval") || method.endsWith("Approval")) return reply({ decision: "decline" });
      return this.transport.send(JSON.stringify({ id, error: { code: -32601, message: `Kotone 不支持 ${method}` } }));
    }
    const tool = this.tools.get(params.tool as string);
    let out: { ok: boolean; text: string };
    try {
      out = tool ? await tool.run(params.arguments) : { ok: false, text: `没有这个工具：${String(params.tool)}` };
    } catch (e) {
      out = { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
    reply({ contentItems: [{ type: "inputText", text: out.text }], success: out.ok });
  }
}
