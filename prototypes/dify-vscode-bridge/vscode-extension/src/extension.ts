import * as vscode from "vscode";
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

type Run = { id: string; status: "running" | "completed" | "failed"; startedAt: string; finishedAt?: string; result?: unknown; error?: string };
let server: http.Server | undefined;
let bearer = "";
let latest: string | undefined;
const runs = new Map<string, Run>();
const log = vscode.window.createOutputChannel("Tessera Bridge");

function json(res: http.ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function body(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1024 * 1024) { reject(new Error("Request exceeds 1 MiB")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Malformed JSON")); } });
    req.on("error", reject);
  });
}
function scriptPath(value: unknown): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) throw new Error("Open a VS Code workspace folder first");
  if (typeof value !== "string" || !value.toLowerCase().endsWith(".py") || path.isAbsolute(value)) throw new Error("script must be a relative .py path");
  const target = path.resolve(root, value);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Script path escapes workspace");
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error("Python script not found");
  return target;
}
function runPython(file: string, input: unknown, record: Run): void {
  const python = vscode.workspace.getConfiguration("tessera").get<string>("pythonPath", "python");
  const child = spawn(python, ["-u", file], { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1" } });
  let stdout = "", stderr = "", tooLarge = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (part: string) => { stdout += part; if (stdout.length > 2 * 1024 * 1024) tooLarge = true; });
  child.stderr.on("data", (part: string) => { stderr = (stderr + part).slice(-256 * 1024); });
  child.on("error", err => { record.status = "failed"; record.error = err.message; record.finishedAt = new Date().toISOString(); });
  child.on("close", code => {
    record.finishedAt = new Date().toISOString();
    if (tooLarge) { record.status = "failed"; record.error = "Python stdout exceeded 2 MiB"; return; }
    if (code !== 0) { record.status = "failed"; record.error = stderr || "Python exited with code " + code; return; }
    try { record.result = JSON.parse(stdout.trim()); record.status = "completed"; }
    catch { record.status = "failed"; record.error = "Python stdout must contain one JSON value. " + (stderr || stdout.slice(0, 800)); }
  });
  child.stdin.end(JSON.stringify(input ?? {}));
}
function start(context: vscode.ExtensionContext): void {
  if (server) return;
  const port = vscode.workspace.getConfiguration("tessera.bridge").get<number>("port", 8765);
  bearer = crypto.randomBytes(24).toString("hex");
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:" + port);
    if (req.method === "GET" && url.pathname === "/health") { json(res, 200, { service: "tessera-vscode-bridge", status: "ready" }); return; }
    if (req.headers.authorization !== "Bearer " + bearer) { json(res, 401, { error: "Unauthorized" }); return; }
    if (req.method === "POST" && url.pathname === "/v1/runs") {
      try {
        const data = await body(req);
        const file = scriptPath(data.script);
        const id = crypto.randomUUID();
        const record: Run = { id, status: "running", startedAt: new Date().toISOString() };
        runs.set(id, record); latest = id; runPython(file, data.input ?? {}, record);
        json(res, 202, { runId: id, status: record.status });
      } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
      return;
    }
    if (req.method === "GET" && (url.pathname === "/v1/latest" || url.pathname.startsWith("/v1/runs/"))) {
      const id = url.pathname === "/v1/latest" ? latest : url.pathname.slice("/v1/runs/".length);
      const record = id ? runs.get(id) : undefined;
      json(res, record ? 200 : 404, record ?? { error: "Run not found" }); return;
    }
    if (req.method === "GET" && url.pathname === "/plot") {
      const file = path.join(context.extensionPath, "media", "plot.html");
      if (!fs.existsSync(file)) { res.writeHead(404); res.end("Plot page missing"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res); return;
    }
    json(res, 404, { error: "Not found" });
  });
  server.on("error", err => { log.appendLine("Server error: " + err.message); vscode.window.showErrorMessage("Tessera Bridge: " + err.message); server = undefined; });
  server.listen(port, "127.0.0.1", () => {
    log.appendLine("Listening on http://127.0.0.1:" + port);
    log.appendLine("Bearer token: " + bearer);
    log.appendLine("Loopback only. Keep the token private.");
    vscode.window.showInformationMessage("Tessera Bridge listening on port " + port);
  });
  log.show(true);
}
function stop(): void { if (server) server.close(); server = undefined; bearer = ""; log.appendLine("Bridge stopped"); }
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(log);
  context.subscriptions.push(vscode.commands.registerCommand("tesseraBridge.start", () => start(context)));
  context.subscriptions.push(vscode.commands.registerCommand("tesseraBridge.stop", stop));
  context.subscriptions.push({ dispose: stop });
}
export function deactivate(): void { stop(); }
