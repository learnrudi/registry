import { createHash } from 'node:crypto';
import { createReviewController } from '../../dist/review-controller.js';
export const hash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const checks = ['runtime-custody','configuration-custody','worker-isolation','process-confinement','credential-separation'];
export function nativeProvenance() {
  return {assurance:'native-session-configuration',effectiveExecution:null,
    ...Object.fromEntries(['sourceDigest','candidateDigest','packetDigest','outputDigest','runtimeProofDigest','approvalDigest','binaryDigest','configurationDigest'].map(key=>[key,hash(key)])),
    native:{runtime:'0.160.1',threadId:'thread-1',turnId:'turn-1',requested:{model:'gpt-6-astra',effort:'xhigh'},
      observed:{model:'gpt-6-astra',effort:'xhigh',provider:'openai',accountType:'chatgpt'},access:'read-only',freshContext:true,terminationConfirmed:true}};
}
export function nativeFixture() {
  let clock=1700000000000; let enabled=true; let intent; let audit; let calls=0;
  const policy={schemaVersion:2,enabled:true,repositoryIds:[7],model:'gpt-6-astra',effort:'xhigh',reviewerHostId:'worker',proofHostId:'proof',
    requiredChecks:[{id:'test',commandDigest:hash('test command')}],
    acceptance:{assurance:'native-session-configuration',approvalDigest:hash('owner approval'),runtime:'0.160.1',binaryDigest:hash('approved binary'),configurationDigest:hash('approved configuration'),
      requiredRuntimeChecks:checks.map(id=>({id,commandDigest:hash(id)}))}};
  const contractText='Approved task';const sourceText='Frozen source';
  const proof={schemaVersion:1,repositoryId:7,baseSha:'a'.repeat(40),headSha:'b'.repeat(40),contractDigest:hash(contractText),sourceDigest:hash(sourceText),policyDigest:hash(policy),executorHostId:'proof',terminationConfirmed:true,
    checks:[{...policy.requiredChecks[0],exitCode:0,outputDigest:hash('test output')}]};
  const runtimeProof={schemaVersion:1,policyDigest:hash(policy),workerHostId:'worker',executorHostId:'proof',runtime:'0.160.1',binaryDigest:policy.acceptance.binaryDigest,configurationDigest:policy.acceptance.configurationDigest,
    checkedAt:clock-1000,expiresAt:clock+600000,terminationConfirmed:true,
    checks:policy.acceptance.requiredRuntimeChecks.map(check=>({...check,exitCode:0,outputDigest:hash('runtime proof '+check.id)}))};
  const candidate={schemaVersion:2,contractText,sourceText,sourceDigest:hash(sourceText),runtimeProofDigest:hash(runtimeProof),binding:{repositoryId:7,pullNumber:2,baseSha:proof.baseSha,headSha:proof.headSha,
    contractDigest:hash(contractText),proofDigest:hash(proof),policyDigest:hash(policy),model:'gpt-6-astra',effort:'xhigh',reviewerHostId:'worker',authorHostId:'author'}};
  const authority={withLock:async(_id,fn)=>fn(),loadCandidate:async()=>JSON.stringify(candidate),loadPolicy:async()=>JSON.stringify(policy),loadProof:async()=>JSON.stringify(proof),loadRuntimeProof:async()=>JSON.stringify(runtimeProof),
    loadIntent:async()=>intent,loadAudit:async()=>audit,writeIntent:async(_id,value)=>{intent=structuredClone(value);},writeAudit:async(_id,value)=>{audit=structuredClone(value);}};
  const nativeHost={review:async request=>{calls++;return {schemaVersion:1,status:'observed',runtime:'0.160.1',threadId:'thread-1',turnId:'turn-1',requested:{model:'gpt-6-astra',effort:'xhigh'},
    observed:{model:'gpt-6-astra',effort:'xhigh',provider:'openai',accountType:'chatgpt'},effectiveExecution:null,acceptanceEligible:false,assurance:'native-session-configuration-only',access:'read-only',freshContext:true,packetDigest:request.packetDigest,
    outputText:JSON.stringify({verdicts:{standards:'pass',spec:'pass',proof:'pass',overall:'pass'},findings:[]}),terminationConfirmed:true};}};
  const controller=createReviewController({authority,nativeHost,enabled:async()=>enabled,now:()=>clock,timeoutMs:1000});
  return {controller,authority,nativeHost,policy,proof,runtimeProof,candidate,calls:()=>calls,advance:ms=>{clock+=ms;},now:()=>clock,disable:()=>{enabled=false;}};
}
