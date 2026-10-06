// Invoked only by the root-owned finite supervisor under the publisher UID.
// No MCP registration, scheduler, listening socket or arbitrary command input.
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Socket } from 'node:net';
import { importReviewerSource } from '../dist/reviewer-source.js';
import { createReviewerTokenProvider } from '../dist/reviewer-auth.js';
import { createReviewController } from '../dist/review-controller.js';
import { openReviewAuthorityStore } from '../dist/review-authority-store.js';
import { createAcceptanceSigner } from '../dist/reviewer-service.js';
import { createReviewPublisher } from '../dist/review-publisher.js';
import { openPublicationJournal } from '../dist/publication-journal.js';
import { hashReviewBytes, parseReviewCandidate, reviewId } from '../dist/review-request.js';
import { observeCodexReview } from '../../agent-hosts/src/codex-review.js';
import { createSupervisedCodexReview } from '../../agent-hosts/src/codex-review-supervised.js';

async function protectedRead(path, owner, privateFile = false, max = 600000) {
  if (!isAbsolute(path) || await realpath(path) !== path) throw new Error('Protected path rejected');
  for(let p=dirname(path);;p=dirname(p)) {
    const s=await lstat(p);
    if(!s.isDirectory() || ![0,owner].includes(s.uid) || s.mode&0o022)throw new Error('Protected ancestor rejected');
    if(dirname(p)===p)break;
  }
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const before=await file.stat();
    if(!before.isFile()||before.uid!==owner||before.nlink!==1||before.mode&(privateFile?0o077:0o022)||before.size>max)throw new Error('Protected file rejected');
    const bytes=Buffer.alloc(max+1);let length=0;
    while(length<bytes.length){const r=await file.read(bytes,length,bytes.length-length,length);if(!r.bytesRead)break;length+=r.bytesRead;}
    const after=await file.stat();
    if(length!==before.size||length>max||['size','mtimeMs','ctimeMs','uid','mode','nlink'].some(k=>before[k]!==after[k]))throw new Error('Protected file changed');
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));
  } finally {await file.close();}
}
async function createPrivate(path,bytes) {
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  const parent=await open(dirname(path),constants.O_RDONLY);try{await parent.sync();}finally{await parent.close();}
}
function fd(name) {
  const value=process.env[name];
  if(!/^[0-9]{1,6}$/.test(value??'')||Number(value)<3)throw new Error('Missing supervisor channel');
  return Number(value);
}

async function main() {
  const [root,mode]=process.argv.slice(2);
  if(process.argv.length!==4 || !isAbsolute(root)||!['keygen','source','audit','sign','publish','inspect','reconcile'].includes(mode))throw new Error('Invalid invocation');
  const installation=JSON.parse(await protectedRead(join(root,'policy','installation.json'),0));
  if(process.geteuid()!==installation.publisher.uid || process.geteuid()===0)throw new Error('Publisher identity rejected');
  const privateRoot=join(root,'publisher');
  if(mode==='keygen') {
    const keys=generateKeyPairSync('ed25519');
    await createPrivate(join(privateRoot,'evidence-key.pem'),keys.privateKey.export({format:'pem',type:'pkcs8'}));
    await createPrivate(join(privateRoot,'evidence-public.pem'),keys.publicKey.export({format:'pem',type:'spki'}));
    return {status:'evidence-key-created',mergeAuthorized:false};
  }
  const pilotPath=join(root,'policy','pilot.json');
  const pilotRaw=await protectedRead(pilotPath,0);const pilot=JSON.parse(pilotRaw);
  reviewId(pilot.requestId);
  const current=async(publication=false)=> {
    try {await lstat(join(root,'policy','PILOT-DISABLED'));return false;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(await protectedRead(pilotPath,0)!==pilotRaw || pilot.reviewEnabled!==true || pilot.mergeAuthorized!==false
      || !Number.isSafeInteger(pilot.expiresAt)||pilot.expiresAt<=Date.now()||pilot.expiresAt>Date.now()+3600000
      || (publication && pilot.publicationEnabled!==true))return false;
    return true;
  };
  if(mode!=='reconcile' && !await current())throw new Error('Pilot disabled');
  const privateKey=async name=>createPrivateKey(await protectedRead(join(privateRoot,name),installation.publisher.uid,true,16384));
  const token=createReviewerTokenProvider({...pilot.app,repositoryIds:[pilot.target.repositoryId]}, {privateKey:()=>privateKey('app-key.pem')});
  if(mode==='source')return await importReviewerSource(pilot.target,{tokenProvider:token});
  const authority=await openReviewAuthorityStore(join(privateRoot,'authority'),{authorUid:installation.author.uid,workerUid:installation.worker.uid});
  const candidate= parseReviewCandidate(await authority.loadCandidate(pilot.requestId));
  if(candidate.binding.repositoryId!==pilot.target.repositoryId||candidate.binding.pullNumber!==pilot.target.pullNumber
    ||candidate.binding.baseSha!==pilot.target.baseSha||candidate.binding.headSha!==pilot.target.headSha
    ||candidate.binding.policyDigest!==hashReviewBytes(await authority.loadPolicy()))throw new Error('Candidate not selected');
  let used=false;
  const controller=createReviewController({authority,enabled:()=>current(),nativeHost:{async review(request,{signal}) {
    if(mode!=='audit'||used)throw new Error('Native dispatch not available');used=true;
    const readable=createReadStream(null,{fd:fd('REVIEWER_READ_FD'),autoClose:true});
    const writable=createWriteStream(null,{fd:fd('REVIEWER_WRITE_FD'),autoClose:true});
    const control=new Socket({fd:fd('REVIEWER_CONTROL_FD'),readable:true,writable:true});
    const connection=createSupervisedCodexReview({readable,writable,control,timeoutMs:request.timeoutMs},{signal});
    return observeCodexReview(connection,{...request,cwd:installation.workingDirectory},{signal});
  }}});
  if(mode==='audit') {
    const cancellation=new AbortController();
    const timer=setInterval(()=>{void current().then(ok=>{if(!ok)cancellation.abort();},()=>cancellation.abort());},200);
    try {await controller.audit(pilot.requestId,{signal:cancellation.signal});return {status:'audit-recorded',publication:null,mergeAuthorized:false};}
    finally{clearInterval(timer);cancellation.abort();}
  }
  if(mode==='sign') {
    const signer=createAcceptanceSigner({prepareAcceptance:controller.prepareAcceptance,privateKey:()=>privateKey('evidence-key.pem'),enabled:()=>current(true),
      writeAccepted:async(id,value)=>authority.withLock(id,async()=>{
        const previous=await authority.loadAccepted(id);
        if(previous!==undefined){if(!isDeepStrictEqual(previous,value))throw new Error('Conflicting acceptance');return;}
        await authority.writeAccepted(id,value);
      })});
    return signer.prepare(pilot.requestId);
  }
  const evidenceKey=createPublicKey(await protectedRead(join(privateRoot,'evidence-public.pem'),installation.publisher.uid,true,16384));
  const publisher=createReviewPublisher({appId:pilot.app.appId,botUserId:pilot.botUserId,
    repositories:[{id:pilot.target.repositoryId,owner:pilot.target.owner,repo:pilot.target.repo,baseBranch:pilot.target.baseBranch}],
    evidenceKey,model:'gpt-6-astra',effort:'xhigh',reviewerHostId:candidate.binding.reviewerHostId},
    {enabled:()=>current(true),tokenForRepository:async id=>{if(id!==pilot.target.repositoryId)throw new Error('Foreign repository');return token();},
      journal:await openPublicationJournal(join(privateRoot,'journal')),
      loadRequest:async id=>{if(id!==pilot.requestId)throw new Error('Foreign request');const record=await authority.loadAccepted(id);
        if(!record||!isDeepStrictEqual(record.binding,candidate.binding))throw new Error('Missing signed handoff');return record;}});
  return {status:mode,...await publisher[mode](pilot.requestId),mergeAuthorized:false};
}
main().then(value=>process.stdout.write(JSON.stringify(value)+'\n'),()=>{process.stderr.write('Protected reviewer invocation rejected\n');process.exitCode=1;});
