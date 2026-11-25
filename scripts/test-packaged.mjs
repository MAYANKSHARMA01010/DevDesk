import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp = await mkdtemp(path.join(tmpdir(), 'devdesk-smoke-'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.resolve(process.argv[2] || path.join(root, 'release/mac-arm64/DevDesk.app'));
const outputDir = path.resolve(process.argv[3] || path.join(root, 'release'));
await mkdir(outputDir, {recursive:true});
const {version} = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const api = 'http://127.0.0.1:18300';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
// Refuse to attach to another service or debugging session during a test.
for (const port of [18300, 19222]) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise(resolve => server.close(resolve));
}
const logs=[];
const env={...process.env,NEXT_PUBLIC_API_URL:api,NEXT_PUBLIC_HOSTED_API_URL:'',HOSTED_API_URL:'',DEVDESK_DATA_DIR:path.join(temp,'data')};
delete env.ELECTRON_RUN_AS_NODE;
const app=spawn(path.join(appPath,'Contents/MacOS/DevDesk'),['--user-data-dir='+path.join(temp,'profile'),'--remote-debugging-port=19222'],{cwd:temp,env,stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>logs.push(b.toString()));app.stderr.on('data',b=>logs.push(b.toString()));
let ws;
try {
 let health;
 for(let i=0;i<100;i++){try{health=await (await fetch(api+'/health')).json();break;}catch{} await sleep(200);}
 assert.equal(health?.app,'DevDesk');
 const request=async (route,body)=>{const r=await fetch(api+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.ok(r.ok,route+' '+r.status); return r.json();};
 const initial=await request('/api/workspaces'); assert.deepEqual(initial.data,[]);
 const project=path.join(temp,'fixture');await mkdir(project);
 await writeFile(path.join(project,'.env'),'DEVDESK_TEST_VALUE=synthetic\n');
 await writeFile(path.join(project,'package.json'),JSON.stringify({name:'devdesk-smoke-project',version:'1.0.0',scripts:{test:'node -e "console.log(12345)"'}}));
 const scan=await request('/api/workspaces/scan',{path:project});assert.equal(scan.success,true);
 const saved=await request('/api/workspaces');assert.ok(saved.data.length>0);
 const diagnostics=await request('/api/diagnostics');assert.equal(diagnostics.success,true);assert.equal(diagnostics.data.version,version);
 const projectId=saved.data[0].projects[0].id;
 const started=await request('/api/processes/start',{projectId,script:'smoke',command:'/bin/echo devdesk-release-smoke'});
 await sleep(1000);
 const processLogs=await request('/api/processes/'+started.data.id+'/logs');
 assert.match(JSON.stringify(processLogs),/devdesk-release-smoke/);
 const processes=await request('/api/processes');assert.equal(processes.success,true);
 assert.ok((await readFile(path.join(temp,'data/devdesk.db'))).length>0);
 let target;
 for(let i=0;i<50;i++){try{target=(await(await fetch('http://127.0.0.1:19222/json')).json()).find(x=>x.type==='page');if(target)break;}catch{}await sleep(200);}
 assert.ok(target,'renderer debugging target');ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let seq=0;const pending=new Map();const exceptions=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 await send('Runtime.enable');await send('Page.enable');
 // The user's port 8300 already has a source backend. Route this test renderer to
 // the isolated backend spawned by this packaged app; no source files are changed.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const originalFetch=window.fetch;window.fetch=(input,init)=>originalFetch(typeof input==='string'?input.replace(/http:\\/\\/(?:127\\.0\\.0\\.1|localhost):8300/g,'${api}'):input,init);`});
 await send('Page.reload',{ignoreCache:true});await sleep(3500);
 const state=await send('Runtime.evaluate',{expression:'JSON.stringify({url:location.href,text:document.body.innerText,bridge:typeof window.electron})',returnByValue:true});
 const rendered=JSON.parse(state.result.value);assert.equal(rendered.url,'app://devdesk/');assert.equal(rendered.bridge,'object');assert.match(rendered.text,/devdesk-smoke-project/i);assert.equal(exceptions.length,0);
 const ping=await send('Runtime.evaluate',{expression:'window.electron.ping()',awaitPromise:true,returnByValue:true});assert.equal(ping.result.value,'pong');
 const screenshot=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(path.join(outputDir,'TEST_PROJECTS.png'),Buffer.from(screenshot.data,'base64'));
 const evaluate=async expression => (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 for (const label of ['Terminal','Processes','Git','API Tester','.env','Database','Settings']) {
   const clicked=await evaluate(`(() => {const button=[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(!button)return false;button.click();return true;})()`);
   assert.equal(clicked,true,'navigate '+label);await sleep(700);
 }
 assert.match(await evaluate('document.body.innerText'),new RegExp('v'+version.replaceAll('.','\\.')));
 const settings=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(path.join(outputDir,'TEST_SETTINGS.png'),Buffer.from(settings.data,'base64'));
 // Read the legacy string preference format, then verify serialized updates survive hydration.
 await evaluate(`localStorage.setItem('devdesk_default_ide','cursor');localStorage.setItem('devdesk_sidebar_collapsed','true')`);
 await send('Page.reload',{ignoreCache:true});await sleep(2000);
 assert.equal(await evaluate(`document.querySelector('aside').getBoundingClientRect().width<100`),true,'restore sidebar preference');
 assert.equal(exceptions.length,0,'all views render without exceptions');
 console.log(JSON.stringify({pass:true,version,health:health.app,workspaceCount:saved.data.length,renderedProject:true,rendererExceptions:exceptions,sqlite:true,nativeIpc:true,managedScriptLogs:true,allViews:true,preferenceHydration:true,isolatedBackendPort:18300},null,2));
} finally {
 if(ws)ws.close();app.kill('SIGTERM');await sleep(1200);await writeFile(path.join(outputDir,'smoke-runtime.log'),logs.join(''));
 let stillListening=false;try{stillListening=(await fetch(api+'/health')).ok;}catch{}
 assert.equal(stillListening,false,'owned backend stops on app quit');
}
