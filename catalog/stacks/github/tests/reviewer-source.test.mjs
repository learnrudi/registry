import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { importReviewerSource } from '../dist/reviewer-source.js';

const oid = (kind, bytes) => createHash('sha1').update(`${kind} ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
function fixture() {
  const base='a'.repeat(40),head='b'.repeat(40),routes=new Map();
  const blob = text => { const sha=oid('blob',text); routes.set(`/git/blobs/${sha}`,{sha,size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64')}); return sha; };
  const tree = rows => { const entries=rows.map(([path,sha,mode='100644',type='blob'])=>({path,sha,mode,type}));
    const bytes=Buffer.concat(entries.map(e=>Buffer.concat([Buffer.from(`${e.mode.replace(/^0/,'')} ${e.path}\0`),Buffer.from(e.sha,'hex')])));
    const sha=oid('tree',bytes); routes.set(`/git/trees/${sha}`,{sha,truncated:false,tree:entries}); return sha; };
  const before='Old text\n',after='New text\n';
  const bt=tree([['README.md',blob(before)]]),ht=tree([['README.md',blob(after)]]);
  routes.set(`/git/commits/${base}`,{sha:base,tree:{sha:bt}}); routes.set(`/git/commits/${head}`,{sha:head,tree:{sha:ht}});
  const pr={number:2,state:'open',merged:false,draft:false,changed_files:1,base:{sha:base,ref:'main',repo:{id:7,full_name:'example/docs'}},head:{sha:head,repo:{id:7,full_name:'example/docs'}}};
  routes.set('',{id:7,full_name:'example/docs',archived:false,disabled:false});routes.set('/pulls/2',pr);
  routes.set(`/compare/${base}...${head}`,{merge_base_commit:{sha:base},base_commit:{sha:base}});
  const target={repositoryId:7,owner:'example',repo:'docs',pullNumber:2,baseBranch:'main',baseSha:base,headSha:head,allowedPaths:['README.md']};
  const requests=[];
  const fetchImpl=async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,'Bearer synthetic');const path=String(url).replace('https://api.github.com/repos/example/docs','');requests.push(path);
    assert.ok(routes.has(path),`unexpected ${path}`);return new Response(JSON.stringify(routes.get(path)),{status:200});};
  return {target,deps:{tokenProvider:async()=> 'synthetic',fetchImpl},routes,requests,before,after,pr,tree,blob};
}
test('imports complete verified source from exact GitHub revisions and rechecks the candidate',async()=>{
  const f=fixture();const r=await importReviewerSource(f.target,f.deps);
  assert.equal(r.repositoryId,7);assert.equal(r.baseSha,f.target.baseSha);assert.equal(r.headSha,f.target.headSha);
  assert.deepEqual(r.files.map(x=>[x.path,x.before?.text,x.after?.text]),[['README.md',f.before,f.after]]);
  assert.equal(r.sourceDigest,createHash('sha256').update(r.sourceText).digest('hex'));
  assert.equal(f.requests.filter(x=>x==='/pulls/2').length,2);
});
test('walks nested changed trees, skips unchanged subtrees and rejects omitted changes',async()=>{
  const f=fixture();const nested=f.tree([['note.md',f.blob('Nested\n')]]);
  const head=f.tree([['README.md',f.blob(f.after)],['docs',nested,'040000','tree']]);
  f.routes.get(`/git/commits/${f.target.headSha}`).tree.sha=head;
  f.pr.changed_files=2;f.target.allowedPaths.push('docs/note.md');
  const r=await importReviewerSource(f.target,f.deps);assert.equal(r.files.length,2);
  f.target.allowedPaths.pop();await assert.rejects(importReviewerSource(f.target,f.deps),/^Error: Reviewer source rejected$/);
});
for(const [name,corrupt] of [
  ['stale head',f=>{f.pr.head.sha='c'.repeat(40);}],
  ['stale base',f=>{f.pr.base.sha='c'.repeat(40);}],
  ['foreign repository',f=>{f.pr.head.repo.id=8;}],
  ['draft',f=>{f.pr.draft=true;}],
  ['missing changed file',f=>{f.pr.changed_files=2;}],
  ['truncated tree',f=>{for(const [p,v]of f.routes)if(p.startsWith('/git/trees/'))v.truncated=true;}],
  ['tampered tree',f=>{for(const [p,v]of f.routes)if(p.startsWith('/git/trees/'))v.tree[0].path='OTHER.md';}],
  ['tampered blob',f=>{for(const [p,v]of f.routes)if(p.startsWith('/git/blobs/'))v.content=Buffer.from('forged\n').toString('base64');}],
  ['symlink',f=>{f.routes.get(`/git/commits/${f.target.headSha}`).tree.sha=f.tree([['README.md',f.blob('target'),'120000','blob']]);}],
  ['executable',f=>{f.routes.get(`/git/commits/${f.target.headSha}`).tree.sha=f.tree([['README.md',f.blob(f.after),'100755','blob']]);}],
  ['cancelled',f=>{f.deps.signal=AbortSignal.abort();}],
  ['behind base',f=>{f.routes.get(`/compare/${f.target.baseSha}...${f.target.headSha}`).merge_base_commit.sha='c'.repeat(40);}],
])test(`rejects ${name} without producing source`,async()=>{const f=fixture();corrupt(f);await assert.rejects(importReviewerSource(f.target,f.deps),/^Error: Reviewer source rejected$/);});
test('rechecks revisions after collecting bytes and sanitizes upstream errors',async()=>{
  const f=fixture(),fetchImpl=f.deps.fetchImpl;
  f.deps.fetchImpl=async(...args)=>{if(f.requests.filter(x=>x==='/pulls/2').length===1&&String(args[0]).endsWith('/pulls/2'))f.pr.head.sha='c'.repeat(40);return fetchImpl(...args);};
  await assert.rejects(importReviewerSource(f.target,f.deps),/^Error: Reviewer source rejected$/);
  f.deps.tokenProvider=async()=>{throw new Error('secret upstream text');};
  await assert.rejects(importReviewerSource(f.target,f.deps),/^Error: Reviewer source rejected$/);
});
