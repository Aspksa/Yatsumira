import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const API = "https://foundation-models.api.cloud.ru/v1";
const ROOT = resolve(process.cwd(), ".yatsumira");
const KEY_FILE = join(ROOT, "cloud-key.dpapi");
const SETTINGS_FILE = join(ROOT, "cloud-settings.json");
const ASSISTANT = "Ты — Яцумира, восьмихвостая лисица-хранительница и ИИ-помощница. Отвечай на русском языке, ясно, бережно и полезно. Не утверждай, что ты настоящий человек.";
let runtimeKey = "";

function powerShell(script, input) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input, encoding: "utf8", windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error("Windows DPAPI unavailable");
  return result.stdout.trim();
}
function saveKey(value) {
  if (process.platform !== "win32") { runtimeKey = value; return false; }
  mkdirSync(ROOT, { recursive: true });
  // Windows DPAPI encrypts for the current Windows user. Secret is passed on STDIN, never CLI arguments.
  const ciphertext = powerShell(
    "$v=[Console]::In.ReadToEnd();$s=ConvertTo-SecureString -String $v -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString -SecureString $s))",
    value
  );
  if (!ciphertext) throw new Error("Credential encryption failed");
  writeFileSync(KEY_FILE, ciphertext, { mode: 0o600 });
  runtimeKey = value;
  return true;
}
function getKey() {
  if (runtimeKey) return runtimeKey;
  if (process.env.CLOUD_RU_API_KEY) return process.env.CLOUD_RU_API_KEY;
  if (process.platform !== "win32" || !existsSync(KEY_FILE)) return "";
  runtimeKey = powerShell(
    "$v=[Console]::In.ReadToEnd();$s=ConvertTo-SecureString -String $v;[Console]::Out.Write(([System.Net.NetworkCredential]::new('', $s)).Password)",
    readFileSync(KEY_FILE, "utf8")
  );
  return runtimeKey;
}
function settings() {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
    return { model: typeof parsed.model === "string" ? parsed.model : "" };
  } catch { return { model: "" }; }
}
function setModel(model) {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify({ model }, null, 2), { mode: 0o600 });
  try { chmodSync(SETTINGS_FILE, 0o600); } catch {}
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function body(req, max = 128 * 1024) {
  let bytes = 0, buffers = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > max) { const e = new Error("Request too large"); e.status = 413; throw e; }
    buffers.push(part);
  }
  try { return JSON.parse(Buffer.concat(buffers).toString("utf8")); }
  catch { const e = new Error("Invalid JSON"); e.status = 400; throw e; }
}
async function cloudRequest(path, key, opts = {}) {
  const response = await fetch(API + path, {
    method: opts.method || "GET",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: opts.data ? JSON.stringify(opts.data) : undefined,
    signal: AbortSignal.timeout(45000)
  });
  let data;
  try { data = await response.json(); } catch { throw Object.assign(new Error("Invalid Cloud.ru response"), {status:502}); }
  if (!response.ok) {
    const summary = response.status === 401 || response.status === 403 ? "Ключ Cloud.ru недействителен или не имеет доступа" :
      response.status === 429 ? "Cloud.ru ограничил частоту запросов" :
      "Cloud.ru вернул ошибку HTTP " + response.status;
    throw Object.assign(new Error(summary), { status: response.status >= 500 ? 502 : response.status });
  }
  return data;
}
function safeModel(value) {
  return typeof value === "string" && value.length > 0 && value.length < 200 && !/[\r\n\0]/.test(value);
}
export function cloudApiPlugin() {
  return {
    name: "yatsumira-local-cloud-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (!pathname.startsWith("/api/cloud/")) return next();
        const remote = req.socket.remoteAddress || "";
        if (!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(remote)) return json(res,403,{error:"Local access only"});
        const origin = req.headers.origin;
        if (origin) {
          try {
            const originUrl = new URL(origin);
            if (!["127.0.0.1","localhost"].includes(originUrl.hostname) || originUrl.host !== req.headers.host)
              return json(res,403,{error:"Origin not allowed"});
          } catch { return json(res,403,{error:"Origin not allowed"}); }
        }
        try {
          if (pathname === "/api/cloud/config" && req.method === "GET") {
            return json(res,200,{configured:!!getKey(),persisted:existsSync(KEY_FILE),model:settings().model});
          }
          if (pathname === "/api/cloud/key" && req.method === "POST") {
            const data = await body(req,16*1024);
            if (typeof data.key !== "string" || data.key.trim().length < 8 || data.key.length > 8192)
              return json(res,400,{error:"Некорректный ключ API"});
            const persisted = saveKey(data.key.trim());
            setModel("");
            return json(res,200,{configured:true,persisted});
          }
          if (pathname === "/api/cloud/key" && req.method === "DELETE") {
            runtimeKey = "";
            if (existsSync(KEY_FILE)) unlinkSync(KEY_FILE);
            return json(res,200,{configured:!!process.env.CLOUD_RU_API_KEY});
          }
          if (pathname === "/api/cloud/models" && req.method === "GET") {
            const key = getKey();
            if (!key) return json(res,401,{error:"Сначала сохраните API-ключ"});
            const result = await cloudRequest("/models",key);
            const models = (Array.isArray(result.data) ? result.data : [])
              .map(item => item?.id).filter(safeModel).sort((a,b)=>a.localeCompare(b));
            return json(res,200,{models,selected:settings().model});
          }
          if (pathname === "/api/cloud/model" && req.method === "POST") {
            const input = await body(req,2048);
            if (!safeModel(input.model)) return json(res,400,{error:"Выберите модель"});
            // Verify the selected model is available to this API credential.
            const key = getKey();
            if (!key) return json(res,401,{error:"Нет API-ключа"});
            const result = await cloudRequest("/models",key);
            if (!Array.isArray(result.data) || !result.data.some(item=>item.id===input.model))
              return json(res,400,{error:"Модель недоступна для этого ключа"});
            setModel(input.model);
            return json(res,200,{model:input.model});
          }
          if (pathname === "/api/cloud/chat" && req.method === "POST") {
            const key = getKey(), model = settings().model;
            if (!key || !model) return json(res,400,{error:"Настройте ключ и модель Cloud.ru"});
            const input = await body(req);
            if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 30 ||
                input.messages.some(m=>!["user","assistant"].includes(m?.role) || typeof m.content !== "string" ||
                !m.content.trim() || m.content.length > 4000)) {
              return json(res,400,{error:"Неверный формат сообщений"});
            }
            const messages = [{ role:"system",content:ASSISTANT },...input.messages];
            const response = await cloudRequest("/chat/completions",key,{method:"POST",data:{model,messages,stream:false}});
            const answer = response?.choices?.[0]?.message?.content;
            if (typeof answer !== "string" || !answer.trim()) return json(res,502,{error:"Cloud.ru вернул пустой ответ"});
            return json(res,200,{answer,model});
          }
          return json(res,404,{error:"Unknown endpoint"});
        } catch (err) {
          const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 502;
          const message = err instanceof Error ? err.message : "Ошибка Cloud.ru";
          return json(res,status,{error:message});
        }
      });
    }
  };
}
