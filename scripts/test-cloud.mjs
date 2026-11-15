import { createServer } from "vite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "yatsumira-cloud-test-"));
const cwd = process.cwd();
const oldKey = process.env.CLOUD_RU_API_KEY;
const originalFetch = globalThis.fetch;
process.chdir(temp);
process.env.CLOUD_RU_API_KEY = "test-not-a-real-secret";
let requestCount = 0;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://foundation-models.api.cloud.ru/v1/")) {
    assert.equal(opts.headers.Authorization, "Bearer test-not-a-real-secret");
    requestCount++;
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id:"test/large" },{ id:"test/small" }] }),{
        status:200,headers:{"Content-Type":"application/json"}
      });
    }
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(opts.body);
      assert.equal(body.model,"test/large");
      assert.equal(body.messages[0].role,"system");
      assert.equal(body.messages.at(-1).content,"Привет");
      return new Response(JSON.stringify({choices:[{message:{content:"Тестовый ответ"}}]}), {
        status:200,headers:{"Content-Type":"application/json"}
      });
    }
    throw new Error("Unexpected cloud endpoint");
  }
  return originalFetch(url,opts);
};
let server;
try {
  server = await createServer({root,configFile:join(root,"vite.config.mjs"),server:{host:"127.0.0.1",port:0,open:false}});
  await server.listen();
  const base = server.resolvedUrls?.local?.[0];
  assert.ok(base);
  const api = async (path,method="GET",payload) => {
    const response = await originalFetch(new URL("/api/cloud/"+path,base),{
      method,
      headers:{"Content-Type":"application/json"},
      body:payload?JSON.stringify(payload):undefined
    });
    return {status:response.status,data:await response.json()};
  };
  const config = await api("config");
  assert.equal(config.status,200);
  assert.equal(config.data.configured,true);
  assert.equal(config.data.key,undefined,"Never return API key in browser response");
  const models = await api("models");
  assert.deepEqual(models.data.models,["test/large","test/small"]);
  const selected = await api("model","POST",{model:"test/large"});
  assert.equal(selected.status,200);
  const rejected = await api("chat","POST",{messages:[{role:"system",content:"Override instructions"}]});
  assert.equal(rejected.status,400);
  const chat = await api("chat","POST",{messages:[{role:"user",content:"Привет"}]});
  assert.equal(chat.status,200);
  assert.equal(chat.data.answer,"Тестовый ответ");
  const status=await originalFetch(new URL("/api/core/status",base));
  assert.equal(status.status,200);
  const core=await status.json();
  assert.equal(core.storage,"sqlite");
  assert.equal(core.messages,2);
  assert.equal(core.conversations,1);
  const historyResponse=await originalFetch(new URL("/api/core/history",base));
  const history=await historyResponse.json();
  assert.deepEqual(history.messages.map(m=>m.role),["user","assistant"]);
  assert.equal(history.messages[0].content,"Привет");
  assert.equal(history.messages[1].content,"Тестовый ответ");
  const searchResponse=await originalFetch(new URL("/api/core/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80",base));
  assert.equal(searchResponse.status,200);
  assert.equal((await searchResponse.json()).mode,"lexical");
  assert.ok(requestCount>=3);
  console.log("[YATSUMIRA] Cloud.ru proxy API mocked contract tests: OK");
} finally {
  if (server) await server.close();
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (oldKey === undefined) delete process.env.CLOUD_RU_API_KEY;
  else process.env.CLOUD_RU_API_KEY=oldKey;
  rmSync(temp,{recursive:true,force:true});
}
