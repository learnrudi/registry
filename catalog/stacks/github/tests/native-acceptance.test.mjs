import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFixture,hash} from './fixtures/native-acceptance.mjs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyReviewEvidence} from '../dist/review-evidence.js';

test('explicit native-configuration policy prepares exact unsigned evidence from a completed audit',async()=>{
  const f=nativeFixture();
  const audit=await f.controller.audit('review-1');
  const evidence=await f.controller.prepareAcceptance('review-1');
  assert.equal(evidence.schemaVersion,2);
  assert.equal(evidence.provenance.assurance,'native-session-configuration');
  assert.equal(evidence.provenance.effectiveExecution,null);
  assert.equal(evidence.provenance.sourceDigest,f.candidate.sourceDigest);
  assert.equal(evidence.provenance.candidateDigest,hash(f.candidate));
  assert.equal(evidence.provenance.packetDigest,audit.packetDigest);
  assert.equal(evidence.provenance.outputDigest,audit.outputDigest);
  assert.equal(evidence.provenance.runtimeProofDigest,hash(f.runtimeProof));
  assert.equal(evidence.provenance.native.threadId,'thread-1');
  assert.equal(evidence.provenance.native.turnId,'turn-1');
  assert.equal(evidence.expiresAt,f.runtimeProof.expiresAt);
  assert.equal(evidence.signature,undefined);
  assert.equal(audit.acceptanceEligible,false);
  assert.equal(audit.publication,null);
  assert.equal(f.calls(),1);
  assert.deepEqual(await f.controller.prepareAcceptance('review-1'),evidence);
  assert.equal(f.calls(),1,'preparation must not run another review');
  const keys=generateKeyPairSync('ed25519');
  const payload=Buffer.from(JSON.stringify(evidence)).toString('base64url');
  const envelope={payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64url')};
  assert.deepEqual(verifyReviewEvidence(envelope,keys.publicKey,f.candidate.binding,f.now()),evidence);
});

test('preparation requires an existing audit and never launches one',async()=>{
  const f=nativeFixture();await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);
  assert.equal(f.calls(),0);assert.equal(await f.authority.loadIntent('review-1'),undefined);
});

test('legacy audit policy never implicitly opts into native acceptance',async()=>{
  const f=nativeFixture();f.policy.schemaVersion=1;delete f.policy.acceptance;
  f.candidate.schemaVersion=1;delete f.candidate.runtimeProofDigest;
  f.proof.policyDigest=hash(f.policy);f.candidate.binding.policyDigest=hash(f.policy);f.candidate.binding.proofDigest=hash(f.proof);
  await f.controller.audit('review-1');
  await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);assert.equal(f.calls(),1);
});

for(const [name,change] of [
  ['missing owner approval',p=>{delete p.acceptance.approvalDigest;}],
  ['wrong assurance',p=>{p.acceptance.assurance='provider-attested';}],
  ['missing confinement check',p=>{p.acceptance.requiredRuntimeChecks.splice(3,1);}],
  ['wrong runtime',p=>{p.acceptance.runtime='0.147.0';}],
]) test(`policy rejects ${name} before inference`,async()=>{
  const f=nativeFixture();change(f.policy);
  f.proof.policyDigest=hash(f.policy);f.candidate.binding.policyDigest=hash(f.policy);f.candidate.binding.proofDigest=hash(f.proof);
  await assert.rejects(f.controller.audit('review-1'),/rejected/);assert.equal(f.calls(),0);
});

for(const [name,change] of [
  ['failed isolation',p=>{p.checks[2].exitCode=1;}],
  ['missing credential separation',p=>{p.checks.pop();}],
  ['wrong check command',p=>{p.checks[0].commandDigest=hash('unapproved');}],
  ['missing output evidence',p=>{delete p.checks[0].outputDigest;}],
  ['author as proof host',p=>{p.executorHostId='author';}],
  ['different worker',p=>{p.workerHostId='other';}],
  ['different binary',p=>{p.binaryDigest=hash('replacement');}],
  ['different configuration',p=>{p.configurationDigest=hash('replacement');}],
  ['wrong policy',p=>{p.policyDigest=hash('different policy');}],
  ['future checkpoint',p=>{p.checkedAt+=2000;}],
  ['expired checkpoint',p=>{p.expiresAt=1699999999999;}],
  ['unbounded lifetime',p=>{p.expiresAt+=3600000;}],
  ['unconfirmed drain',p=>{p.terminationConfirmed=false;}],
]) test(`native preparation rejects ${name}`,async()=>{
  const f=nativeFixture();change(f.runtimeProof);f.candidate.runtimeProofDigest=hash(f.runtimeProof);
  await f.controller.audit('review-1');
  await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);assert.equal(f.calls(),1);
});

test('runtime proof bytes cannot be replaced after review',async()=>{
  const f=nativeFixture();await f.controller.audit('review-1');f.runtimeProof.checkedAt--;
  await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);
});

test('acceptance preparation never extends the original review or proof lifetime',async()=>{
  const f=nativeFixture();await f.controller.audit('review-1');const first=await f.controller.prepareAcceptance('review-1');
  f.advance(100000);assert.deepEqual(await f.controller.prepareAcceptance('review-1'),first);
  f.advance(600000);await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);assert.equal(f.calls(),1);
});

for(const [name,output] of [
  ['failed verdict',{verdicts:{standards:'pass',spec:'pass',proof:'blocked',overall:'blocked'},findings:[]}],
  ['unresolved P2',{verdicts:{standards:'pass',spec:'pass',proof:'pass',overall:'pass'},findings:[{priority:2,disposition:'ignore'}]}],
  ['empty P3 disposition',{verdicts:{standards:'pass',spec:'pass',proof:'pass',overall:'pass'},findings:[{priority:3,disposition:' '}]}],
])test(`native preparation rejects ${name}`,async()=>{
  const f=nativeFixture();const review=f.nativeHost.review;
  f.nativeHost.review=async(...args)=>({...await review(...args),outputText:JSON.stringify(output)});
  await f.controller.audit('review-1');await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);
});

test('policy replacement during runtime read prevents preparation',async()=>{
  const f=nativeFixture();await f.controller.audit('review-1');const read=f.authority.loadRuntimeProof;let calls=0;
  f.authority.loadRuntimeProof=async(...args)=>{if(++calls===2)f.policy.acceptance.approvalDigest=hash('replacement');return read(...args);};
  await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);
});

test('owner cancellation discards a late runtime proof without returning evidence',async()=>{
  const f=nativeFixture();await f.controller.audit('review-1');const owner=new AbortController();let release;let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  f.authority.loadRuntimeProof=()=>{entered();return new Promise(resolve=>{release=resolve;});};
  const pending=f.controller.prepareAcceptance('review-1',{signal:owner.signal});void pending.catch(()=>{});
  await started;owner.abort();await assert.rejects(pending,/rejected/);
  release(JSON.stringify(f.runtimeProof));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls(),1);
});

for(const [name,text] of [['ASCII finding limit','x'.repeat(1000)],['UTF-8 byte boundary','界'.repeat(400)]])
test(`large valid ${name} review round-trips through prepared signed evidence`,async()=>{
  const f=nativeFixture();const review=f.nativeHost.review;
  f.nativeHost.review=async(...args)=>({...await review(...args),outputText:JSON.stringify({
    verdicts:{standards:'pass',spec:'pass',proof:'pass',overall:'pass'},
    findings:Array.from({length:100},()=>({priority:3,disposition:text}))
  })});
  await f.controller.audit('review-1');const evidence=await f.controller.prepareAcceptance('review-1');
  const keys=generateKeyPairSync('ed25519');const payload=Buffer.from(JSON.stringify(evidence)).toString('base64url');
  const signed={payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64url')};
  assert.deepEqual(verifyReviewEvidence(signed,keys.publicKey,f.candidate.binding,f.now()),evidence);
});

test('revocation during the final runtime read prevents acceptance preparation',async()=>{
  const f=nativeFixture();await f.controller.audit('review-1');
  const read=f.authority.loadRuntimeProof;let calls=0;
  f.authority.loadRuntimeProof=async(...args)=>{if(++calls===2)f.disable();return read(...args);};
  await assert.rejects(f.controller.prepareAcceptance('review-1'),/rejected/);
});
