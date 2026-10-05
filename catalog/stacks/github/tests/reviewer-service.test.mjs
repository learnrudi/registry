import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createAcceptanceSigner } from '../dist/reviewer-service.js';
import { verifyReviewEvidence } from '../dist/review-evidence.js';
import { nativeFixture } from './fixtures/native-acceptance.mjs';
test('signer obtains controller-prepared evidence and verifies before immutable handoff',async()=>{
  const f=nativeFixture();await f.controller.audit('request');
  const key=generateKeyPairSync('ed25519');let saved;let reads=0;
  const service=createAcceptanceSigner({prepareAcceptance:id=>{reads++;return f.controller.prepareAcceptance(id);},
    enabled:async()=>true,privateKey:async()=>key.privateKey,now:f.now,
    writeAccepted:async(id,value)=>{assert.equal(id,'request');saved=value;}});
  const r=await service.prepare('request');assert.equal(reads,1);
  assert.equal(r.status,'signed');assert.equal(r.publication,null);assert.equal(r.mergeAuthorized,false);
  const evidence=verifyReviewEvidence(saved.envelope,key.publicKey,f.candidate.binding,f.now());
  assert.equal(evidence.provenance.effectiveExecution,null);assert.equal(f.calls(),1);
});
for (const condition of ['disabled','failed-proof','revoked-key-load','wrong-key','expired','cancelled','immutable-conflict']) test(`signer rejects ${condition} before publication`,async()=>{
  const f=nativeFixture();await f.controller.audit('request');const keys=generateKeyPairSync('ed25519');let enabled=true,writes=0;
  const cancel=new AbortController();
  const deps={prepareAcceptance:id=>f.controller.prepareAcceptance(id),enabled:async()=>enabled,privateKey:async()=>keys.privateKey,now:f.now,
    writeAccepted:async()=>{if(condition==='immutable-conflict')throw new Error('conflict');writes++;}};
  if(condition==='disabled')enabled=false;
  if(condition==='failed-proof')f.runtimeProof.checks[0].exitCode=1;
  if(condition==='revoked-key-load')deps.privateKey=async()=>{enabled=false;return keys.privateKey;};
  if(condition==='wrong-key')deps.privateKey=async()=>generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
  if(condition==='expired')deps.privateKey=async()=>{f.advance(1800001);return keys.privateKey;};
  if(condition==='cancelled')cancel.abort();
  await assert.rejects(createAcceptanceSigner(deps).prepare('request',{signal:cancel.signal}),/^Error: Acceptance signing rejected$/);
  assert.equal(writes,0);
});
