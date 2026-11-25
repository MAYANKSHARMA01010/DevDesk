import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { freeBackendPort } from "../desktop/dist/backendPort.js";

async function listener(t, stubborn = false) {
  const child = spawn(process.execPath, ["-e", `
    const server = require('node:http').createServer((req,res)=>res.end(JSON.stringify({status:'ok',app:'OtherApp'})));
    ${stubborn ? "process.on('SIGTERM',()=>{});" : ""}
    server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
  `], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = once(child, "exit");
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const [output] = await once(child.stdout, "data", { signal: AbortSignal.timeout(5000) });
  return { child, port: Number(String(output).trim()), exited };
}

test("reclaims a listening port without terminating another listener", async (t) => {
  const target = await listener(t);
  const other = await listener(t);
  await freeBackendPort(target.port);
  assert.equal((await target.exited)[1], "SIGTERM");
  assert.equal(other.child.signalCode, null);
  assert.equal((await (await fetch(`http://127.0.0.1:${other.port}`)).json()).app, "OtherApp");
  await freeBackendPort(target.port); // idempotent when no listener exists
});

test("escalates when a listener ignores graceful termination", async (t) => {
  const target = await listener(t, true);
  await freeBackendPort(target.port);
  assert.equal((await target.exited)[1], "SIGKILL");
});

test("protects the application and validates the port", async (t) => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(freeBackendPort(server.address().port), /launcher/);
  await assert.rejects(freeBackendPort(0), /Invalid/);
  await assert.rejects(freeBackendPort(65536), /Invalid/);
});
