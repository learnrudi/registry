import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Duplex } from 'node:stream';
import { createSupervisedCodexReview } from '../src/codex-review-supervised.js';
function fixture(answer='{"terminationConfirmed":true}\n') {
  const readable=new PassThrough(),writable=new PassThrough(),responses=new PassThrough(),requests=new PassThrough();
  const control=Duplex.from({readable:responses,writable:requests});let stops=0;
  requests.on('data',data=>{assert.equal(data.toString(),'stop\n');stops++;if(answer)responses.end(answer);});
  writable.on('data',data=>{const r=JSON.parse(data);readable.write(JSON.stringify({id:r.id,result:{ready:true}})+'\n');});
  return {readable,writable,control,responses,stops:()=>stops,close(){for(const s of [readable,writable,control,responses,requests])s.destroy();}};
}
test('requires dedicated supervisor drain acknowledgment and stops exactly once',async()=>{
  const f=fixture();const rpc=createSupervisedCodexReview({...f,timeoutMs:1000});
  try {assert.deepEqual(await rpc.request('initialize',{}),{ready:true});assert.equal((await rpc.stop()).terminationConfirmed,true);
    assert.equal((await rpc.stop()).terminationConfirmed,true);assert.equal(f.stops(),1);}
  finally {f.close();}
});
for(const answer of ['{"terminationConfirmed":false}\n','{"terminationConfirmed":true,"extra":1}\n','garbage\n','x'.repeat(101),null])test(`unconfirmed supervisor response rejects: ${String(answer).slice(0,40)}`,async()=>{
  const f=fixture(answer),rpc=createSupervisedCodexReview({...f,timeoutMs:2000});
  try{assert.equal((await rpc.stop()).terminationConfirmed,false);assert.equal(f.stops(),1);}finally{f.close();}
});
test('unsolicited supervisor acknowledgment cannot authorize termination',async()=>{
  const f=fixture(null),rpc=createSupervisedCodexReview({...f,timeoutMs:1000});
  f.responses.end('{"terminationConfirmed":true}\n');
  await new Promise(resolve=>setImmediate(resolve));
  try{assert.equal((await rpc.stop()).terminationConfirmed,false);}finally{f.close();}
});
test('connection deadline rejects a stuck RPC and requests supervisor shutdown',async()=>{
  const f=fixture();f.writable.removeAllListeners('data');const rpc=createSupervisedCodexReview({...f,timeoutMs:100});
  try {await assert.rejects(rpc.request('initialize',{}),/rejected/);assert.equal((await rpc.stop()).terminationConfirmed,false);assert.equal(f.stops(),1);}
  finally{f.close();}
});
