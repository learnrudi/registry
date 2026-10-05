import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodexReviewProcess } from "../src/codex-review-process.js";
import { observeCodexReview } from "../src/codex-review.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function configuration(script, directory, overrides = {}) {
  return { command: process.execPath, arguments: ["--input-type=module", "-e", script],
    environment: {}, workingDirectory: directory, timeoutMs: 5000, maxStdoutBytes: 1048576, ...overrides };
}
function killOwnedGroup(pid) {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
const quietServer = `
  import readline from 'node:readline';
  readline.createInterface({input:process.stdin}).on('line', text => {
    const req=JSON.parse(text);if(req.method==='initialize')process.stdout.write(JSON.stringify({id:req.id,result:{leader:process.pid}})+'\\n');
  });
`;

test("stopping a review connection drains its descendant process group", { timeout: 6000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "review-process-"));
  const marker = join(directory, "unexpected-descendant-write");
  const descendant = `setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'still running'); }, 550);`;
  const source = `
    import { spawn } from 'node:child_process';
    import readline from 'node:readline';
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore', env: {} });
    const lines = readline.createInterface({input:process.stdin});
    lines.on('line', text => { const req=JSON.parse(text); if(req.id) process.stdout.write(JSON.stringify({id:req.id,result:{leader:process.pid,descendant:child.pid}})+'\\n'); });
  `;
  const rpc = createCodexReviewProcess(configuration(source, directory));
  let pid;
  try {
    const ready = await rpc.request("initialize", {});
    pid = ready.leader;
    assert.equal((await rpc.stop()).terminationConfirmed, true);
    await delay(700);
    assert.equal(existsSync(marker), false, "shutdown must not leave the descendant alive");
  } finally {
    killOwnedGroup(pid);
    await rpc.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a connection deadline rejects stuck RPC and drains the child", {timeout:4000}, async () => {
  const rpc = createCodexReviewProcess(configuration(quietServer, tmpdir(), {timeoutMs:250}));
  let pid;
  try {
    pid=(await rpc.request("initialize",{})).leader;
    await assert.rejects(Promise.race([rpc.request("account/read",{}), delay(750)]), /rejected/);
    assert.equal((await rpc.stop()).terminationConfirmed,true);
    assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  } finally { killOwnedGroup(pid);await rpc.stop(); }
});

test("invalid configuration is rejected before a child is launched", async () => {
  let rpc;
  try {
    assert.throws(() => { rpc=createCodexReviewProcess(configuration(quietServer,tmpdir(),{timeoutMs:0})); }, /configuration rejected/);
  } finally { if(rpc)await rpc.stop(); }
});

test("configuration accessors cannot change a validated limit before launch", async () => {
  let reads=0;
  let rpc;
  const config=configuration(quietServer,tmpdir());
  Object.defineProperty(config,'maxStdoutBytes',{enumerable:true,get(){return ++reads<=3?1024:8388608;}});
  try {
    assert.throws(()=>{rpc=createCodexReviewProcess(config);},/configuration rejected/);
    assert.equal(reads,0,'data-only configuration must not execute accessors');
  } finally {if(rpc)await rpc.stop();}
});

for (const container of ['arguments','environment']) test(`nested ${container} accessors are rejected without execution`, async () => {
  const config=configuration(quietServer,tmpdir());
  let reads=0;
  let rpc;
  Object.defineProperty(config[container],container==='arguments'?'0':'LANG',{
    enumerable:true,get(){reads++;return 'changing';}
  });
  try {
    assert.throws(()=>{rpc=createCodexReviewProcess(config);},/configuration rejected/);
    assert.equal(reads,0);
  } finally {if(rpc)await rpc.stop();}
});

test("spawn failure rejects privately and confirms that no process was launched", {timeout:3000}, async () => {
  const rpc=createCodexReviewProcess(configuration(quietServer,tmpdir(),{command:'/unavailable-native-review-fixture'}));
  try {
    await assert.rejects(rpc.request('initialize',{}),error=>error.message==='Native review RPC rejected');
    assert.equal((await rpc.stop()).terminationConfirmed,true);
  } finally {await rpc.stop();}
});

test("owner cancellation rejects pending RPC and drains the group", {timeout:4000}, async () => {
  const abort = new AbortController();
  const rpc=createCodexReviewProcess(configuration(quietServer,tmpdir()),{signal:abort.signal});
  let pid;
  try {
    pid=(await rpc.request('initialize',{})).leader;
    const pending=rpc.request('account/read',{});
    abort.abort();
    await assert.rejects(Promise.race([pending,delay(500)]),/rejected/);
    assert.equal((await rpc.stop()).terminationConfirmed,true);
    assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  }finally{killOwnedGroup(pid);await rpc.stop();}
});

test("already-cancelled connection refuses to launch", async()=>{
  let rpc;
  try{
    assert.throws(()=>{rpc=createCodexReviewProcess(configuration(quietServer,tmpdir()),{signal:AbortSignal.abort()});},/cancelled/);
  }finally{if(rpc)await rpc.stop();}
});

for (const stream of ['stdout','stderr']) test(`oversized ${stream} rejects privately before forwarding an oversized reply`, {timeout:4000}, async()=>{
  const rpc=createCodexReviewProcess(configuration(`
    import readline from 'node:readline';
    readline.createInterface({input:process.stdin}).on('line',text=>{
      const req=JSON.parse(text);
      if(req.method==='initialize')process.stdout.write(JSON.stringify({id:req.id,result:{leader:process.pid}})+'\\n');
      else if(${JSON.stringify(stream)}==='stdout')process.stdout.write(JSON.stringify({id:req.id,result:{private:'s'.repeat(3000)}})+'\\n');
      else process.stderr.write('private'.repeat(50000));
    });
  `,tmpdir(),{maxStdoutBytes:1024}));
  let pid;
  try{
    pid=(await rpc.request('initialize',{})).leader;
    await assert.rejects(Promise.race([rpc.request('account/read',{}),delay(700)]),error=>error.message==='Native review RPC rejected');
    assert.equal((await rpc.stop()).terminationConfirmed,true);
  }finally{killOwnedGroup(pid);await rpc.stop();}
});

test("leader exit drains descendants even while inherited pipes remain open", { timeout: 6000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "review-exit-"));
  const marker = join(directory, "unexpected-orphan-write");
  const descendant = `setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'); }, 550);`;
  const rpc = createCodexReviewProcess(configuration(`
    import {spawn} from 'node:child_process';
    import readline from 'node:readline';
    spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:['ignore','inherit','inherit'],env:{}});
    readline.createInterface({input:process.stdin}).on('line', text => {
      const req=JSON.parse(text);process.stdout.write(JSON.stringify({id:req.id,result:{leader:process.pid}})+'\\n',()=>process.exit(0));
    });
  `, directory));
  let pid;
  try {
    pid = (await rpc.request("initialize", {})).leader;
    await delay(700);
    assert.equal(existsSync(marker), false, "leader exit must drain inherited-pipe descendants");
  } finally {
    killOwnedGroup(pid);
    await rpc.stop();
    rmSync(directory, {recursive:true,force:true});
  }
});

test("stop allows graceful exit and shares one termination result", {timeout:4000}, async () => {
  const directory=mkdtempSync(join(tmpdir(),'review-grace-'));
  const marker=join(directory,'terminated');
  const rpc=createCodexReviewProcess(configuration(`
    import {writeFileSync} from 'node:fs';
    process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(marker)},'graceful');process.exit(0);});
    ${quietServer}
  `,directory));
  let pid;
  try {
    pid=(await rpc.request('initialize',{})).leader;
    const first=rpc.stop();
    assert.equal(rpc.stop(),first);
    assert.equal((await first).terminationConfirmed,true);
    assert.equal(existsSync(marker),true,'shutdown must offer a bounded graceful exit');
  } finally {killOwnedGroup(pid);await rpc.stop();rmSync(directory,{recursive:true,force:true});}
});

test("stdout EOF drains a process that remains alive", {timeout:4000}, async () => {
  const directory=mkdtempSync(join(tmpdir(),'review-eof-'));
  const marker=join(directory,'unexpected-write-after-eof');
  const rpc=createCodexReviewProcess(configuration(`
    import {writeFileSync} from 'node:fs';
    import readline from 'node:readline';
    readline.createInterface({input:process.stdin}).on('line',text=>{
      const req=JSON.parse(text);
      process.stdout.end(JSON.stringify({id:req.id,result:{leader:process.pid}})+'\\n');
      setTimeout(()=>writeFileSync(${JSON.stringify(marker)},'still alive'),550);
    });
  `,directory));
  let pid;
  try {
    pid=(await rpc.request('initialize',{})).leader;
    await delay(700);
    assert.equal(existsSync(marker),false,'EOF must start bounded termination');
    assert.equal((await rpc.stop()).terminationConfirmed,true);
  } finally {killOwnedGroup(pid);await rpc.stop();rmSync(directory,{recursive:true,force:true});}
});

test("stop escalates when the child ignores graceful shutdown", {timeout:4000}, async () => {
  const rpc=createCodexReviewProcess(configuration(`process.on('SIGTERM',()=>{});${quietServer}`,tmpdir()));
  let pid;
  try {
    pid=(await rpc.request('initialize',{})).leader;
    assert.equal((await rpc.stop()).terminationConfirmed,true);
    assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  } finally {killOwnedGroup(pid);await rpc.stop();}
});

test("signal permission errors leave termination unconfirmed and bounded", {timeout:5000}, async context => {
  const rpc=createCodexReviewProcess(configuration(quietServer,tmpdir()));
  let pid;
  const actualKill=process.kill.bind(process);
  try {
    pid=(await rpc.request('initialize',{})).leader;
    context.mock.method(process,'kill',(target,signal)=>{
      if(target===-pid)throw Object.assign(new Error('private operation failure'),{code:'EPERM'});
      return actualKill(target,signal);
    });
    const start=performance.now();
    assert.equal((await rpc.stop()).terminationConfirmed,false);
    assert.ok(performance.now()-start<1900,'uncertain termination must return within the observer stop budget');
    await assert.rejects(rpc.request('initialize',{}),error=>error.message==='Native review RPC rejected');
  } finally {context.mock.restoreAll();killOwnedGroup(pid);await rpc.stop();}
});

test("leader-exit cleanup cannot cancel the pending RPC deadline", {timeout:5000}, async context => {
  const rpc=createCodexReviewProcess(configuration(`
    import {spawn} from 'node:child_process';
    import readline from 'node:readline';
    spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit'],env:{}});
    readline.createInterface({input:process.stdin}).on('line',text=>{
      const req=JSON.parse(text);
      if(req.method==='initialize')process.stdout.write(JSON.stringify({id:req.id,result:{leader:process.pid}})+'\\n');
      else process.exit(0);
    });
  `,tmpdir(),{timeoutMs:250}));
  let pid;
  const actualKill=process.kill.bind(process);
  try {
    pid=(await rpc.request('initialize',{})).leader;
    context.mock.method(process,'kill',(target,signal)=>{
      if(target===-pid)throw Object.assign(new Error('synthetic denied drain'),{code:'EPERM'});
      return actualKill(target,signal);
    });
    await assert.rejects(Promise.race([rpc.request('account/read',{}),delay(700)]),error=>error.message==='Native review RPC rejected');
    assert.equal((await rpc.stop()).terminationConfirmed,false);
  } finally {context.mock.restoreAll();killOwnedGroup(pid);await rpc.stop();}
});

test("child receives only the minimal explicit environment", {timeout:4000}, async () => {
  const rpc=createCodexReviewProcess(configuration(`
    import readline from 'node:readline';
    readline.createInterface({input:process.stdin}).on('line',text=>{
      const req=JSON.parse(text);process.stdout.write(JSON.stringify({id:req.id,result:{env:process.env}})+'\\n');
    });
  `,tmpdir(),{environment:{LANG:'C',OPENAI_API_KEY:'synthetic-forbidden',NODE_OPTIONS:'--invalid-flag'}}));
  try {
    const env=(await rpc.request('initialize',{})).env;
    assert.equal(env.LANG,'C');
    assert.equal(env.NO_COLOR,'1');
    assert.equal(env.OPENAI_API_KEY,undefined);
    assert.equal(env.NODE_OPTIONS,undefined);
    assert.ok(Object.keys(env).every(key=>['LANG','NO_COLOR','__CF_USER_TEXT_ENCODING'].includes(key)));
  }
  finally {await rpc.stop();}
});

test("unconfirmed termination releases the caller's handles without claiming success", {timeout:6000}, async () => {
  const moduleUrl=new URL('../src/codex-review-process.js',import.meta.url).href;
  const source=`
    import {createCodexReviewProcess} from ${JSON.stringify(moduleUrl)};
    const rpc=createCodexReviewProcess(${JSON.stringify(configuration(quietServer,tmpdir()))});
    const pid=(await rpc.request('initialize',{})).leader;
    process.stdout.write(JSON.stringify({pid})+'\\n');
    const actual=process.kill.bind(process);
    process.kill=(target,signal)=>{
      if(target===-pid)throw Object.assign(new Error('synthetic permission denial'),{code:'EPERM'});
      return actual(target,signal);
    };
    process.stdout.write(JSON.stringify(await rpc.stop())+'\\n');
  `;
  const parent=spawn(process.execPath,['--input-type=module','-e',source],{cwd:tmpdir(),env:{},detached:true,stdio:['ignore','pipe','pipe']});
  let output='';
  parent.stdout.on('data',chunk=>{output+=chunk;});
  parent.stderr.resume();
  try {
    const exit=await Promise.race([new Promise(resolve=>parent.once('close',code=>resolve({code}))),delay(2400)]);
    assert.deepEqual(exit,{code:0},'caller must not hang on pipes after bounded uncertain stop');
    assert.equal(JSON.parse(output.trim().split('\n').at(-1)).terminationConfirmed,false);
  } finally {
    const pid=output.split('\n').filter(Boolean).map(line=>JSON.parse(line)).find(item=>item.pid)?.pid;
    killOwnedGroup(pid);
    killOwnedGroup(parent.pid);
  }
});

test("real stdio connection composes with native observation without granting acceptance", {timeout:4000}, async () => {
  const passing=JSON.stringify({verdicts:{standards:'pass',spec:'pass',proof:'pass',overall:'pass'},findings:[]});
  const rpc=createCodexReviewProcess(configuration(`
    import readline from 'node:readline';
    const send=message=>process.stdout.write(JSON.stringify(message)+'\\n');
    readline.createInterface({input:process.stdin}).on('line',text=>{
      const req=JSON.parse(text);if(!req.id)return;
      let result;
      if(req.method==='initialize')result={userAgent:'codex/0.151.0'};
      if(req.method==='account/read')result={account:{type:'chatgpt'},requiresOpenaiAuth:true};
      if(req.method==='thread/start')result={
        model:'gpt-6-astra',reasoningEffort:'xhigh',modelProvider:'openai',cwd:req.params.cwd,
        approvalPolicy:'never',sandbox:{type:'readOnly',networkAccess:false},instructionSources:[],
        thread:{id:'t',cliVersion:'0.151.0',modelProvider:'openai',ephemeral:true,turns:[],parentThreadId:null,forkedFromId:null}
      };
      if(req.method==='turn/start')result={turn:{id:'r',status:'inProgress',items:[]}};
      send({id:req.id,result});
      if(req.method==='turn/start'){
        send({method:'item/completed',params:{threadId:'t',turnId:'r',item:{type:'agentMessage',id:'a',phase:'final_answer',text:${JSON.stringify(passing)}}}});
        send({method:'turn/completed',params:{threadId:'t',turn:{id:'r',status:'completed',error:null,items:[]}}});
      }
    });
  `,tmpdir()));
  const packet='Synthetic acceptance contract';
  try {
    const result=await observeCodexReview(rpc,{contentClass:'private_repository',packet,
      packetDigest:createHash('sha256').update(packet).digest('hex'),cwd:tmpdir(),timeoutMs:1500});
    assert.equal(result.status,'observed');
    assert.equal(result.outputText,passing);
    assert.equal(result.effectiveExecution,null);
    assert.equal(result.acceptanceEligible,false);
  } finally {await rpc.stop();}
});
