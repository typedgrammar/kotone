import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import { libraryHome } from "../cli/home.ts";
import { fetchHttp, LYRIC_HOSTS, type HttpRequest } from "../core/lyrics/index.ts";

const HOME = libraryHome();

const body = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let s = "";
    req.on("data", (d) => (s += d)).on("end", () => resolve(s)).on("error", reject);
  });

/** `codex app-server` for the browser: lines out over SSE, lines in over POST (mirrors Agent.swift). */
function devAgent(server: import("vite").ViteDevServer) {
  let proc: ChildProcess | null = null;
  const clients = new Set<import("node:http").ServerResponse>();
  const push = (e: unknown) => clients.forEach((c) => c.write(`data: ${JSON.stringify(e)}\n\n`));
  const PATH = (process.env.PATH ?? "").split(":").filter((p) => !p.includes("/.superset")).join(":");
  server.middlewares.use("/__agent/events", (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });
  const command = (path?: string) => path?.trim().replace(/^~(?=\/)/, process.env.HOME ?? "~") || "codex";
  server.middlewares.use("/__agent/probe", async (req, res) => {
    const { path } = JSON.parse((await body(req)) || "{}") as { path?: string };
    execFile(command(path), ["--version"], { env: { ...process.env, PATH } }, (err, out) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(err ? { path: null, error: err.message } : { path: command(path), version: out.trim() }));
    });
  });
  server.middlewares.use("/__agent/start", async (req, res) => {
    const { path } = JSON.parse((await body(req)) || "{}") as { path?: string };
    if (!proc) {
      let stderr = "";
      proc = spawn(command(path), ["app-server"], { env: { ...process.env, PATH }, stdio: ["pipe", "pipe", "pipe"] });
      let buf = "";
      proc.stdout!.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line) push({ type: "agent", line });
        }
      });
      proc.stderr!.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
      proc.on("error", (e) => (stderr += e.message));
      proc.on("close", (code) => {
        push({ type: "agentExit", code: code ?? 1, stderr });
        proc = null;
      });
    }
    res.end("ok");
  });
  server.middlewares.use("/__agent/send", async (req, res) => {
    proc?.stdin!.write(((JSON.parse(await body(req)) as { line: string }).line) + "\n");
    res.end("ok");
  });
  server.middlewares.use("/__agent/stop", (_req, res) => {
    proc?.kill();
    res.end("ok");
  });
}

// In `pnpm dev` (plain browser) expose the same library the macOS app reads, so songs added
// with `kotone add` show up after a reload, and stand in for the native lyric download / save.
function devLibrary(): Plugin {
  return {
    name: "kotone-dev-library",
    apply: "serve",
    configureServer(server) {
      devAgent(server);
      server.middlewares.use("/__fetch", async (req, res) => {
        try {
          const r = JSON.parse(await body(req)) as HttpRequest;
          if (!LYRIC_HOSTS.includes(new URL(r.url).host)) throw new Error("不允许访问这个地址");
          const out = await fetchHttp(r);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ status: out.status, body: Buffer.from(out.body).toString("base64") }));
        } catch (e) {
          res.statusCode = 502;
          res.end((e as Error).message);
        }
      });
      server.middlewares.use("/__library", async (req, res) => {
        if (req.method === "POST") {
          const { json, overwrite } = JSON.parse(await body(req)) as { json: string; overwrite: boolean };
          const id = (JSON.parse(json) as { id?: string }).id ?? "";
          const file = path.join(HOME, "songs", id, "song.json");
          if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || (fs.existsSync(file) && !overwrite)) {
            res.statusCode = 409;
            return res.end(`资料库里已经有 id 为 ${id} 的歌`);
          }
          fs.mkdirSync(path.dirname(file), { recursive: true });
          if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
          fs.writeFileSync(file, json);
          return res.end("ok");
        }
        const dir = path.join(HOME, "songs");
        const ids = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
        const records = ids
          .filter((id) => fs.existsSync(path.join(dir, id, "song.json")))
          .map((id) => ({ id, json: fs.readFileSync(path.join(dir, id, "song.json"), "utf8") }));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(records));
      });
    },
  };
}

export default defineConfig({
  root: path.dirname(new URL(import.meta.url).pathname),
  base: "./",
  plugins: [solid(), devLibrary()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", emptyOutDir: true, target: "safari16" },
});
