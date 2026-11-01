import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker,{validated} from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
class D1 {
 prepare(sql){const stmt=db.prepare(sql);return {args:[],bind(...args){this.args=args;return this},async first(){return stmt.get(...this.args)||null},async all(){return {results:stmt.all(...this.args)}},syncRun(){return {meta:{changes:Number(stmt.run(...this.args).changes)}}},async run(){return this.syncRun()}}}
 async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.syncRun());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
}
const env={DB:new D1()},ORIGIN='https://finance.test',cookies={};
async function api(path,method='GET',data,user='owner',email=user+'@example.com',extra={}){const headers={'oai-authenticated-user-id':user,'oai-authenticated-user-email':email,'content-type':'application/json',origin:ORIGIN,...(cookies[user]?{cookie:cookies[user]}:{}),...extra};if(!user){delete headers['oai-authenticated-user-id'];delete headers['oai-authenticated-user-email']}const res=await worker.fetch(new Request(ORIGIN+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})}),env);if(res.headers.get('set-cookie'))cookies[user]=res.headers.get('set-cookie').split(';')[0];return {status:res.status,body:await res.json()}}
const element={addEventListener(){},classList:{remove(){}},value:'',innerHTML:'',textContent:''},ctx={console,crypto,Intl,Date,Set,Map,TextDecoder,TextEncoder,URL,Blob,Response,DecompressionStream,document:{querySelector:()=>element},localStorage:{getItem:()=>null,setItem(){}},setTimeout(){},navigator:{},window:{}};
vm.createContext(ctx);let source=fs.readFileSync('public/app.js','utf8');vm.runInContext(source.slice(0,source.indexOf("$('#today').textContent")),ctx);const fixture=JSON.parse(vm.runInContext("state=normalizeData(convertToIRR(seed()));state.checkAccounting='receipt';state.warehouseSchema=1;JSON.stringify(state)",ctx));
assert.equal((await api('/api/session','GET',null,'')).status,401);
assert.equal((await api('/api/auth/status')).body.setupRequired,true);assert.equal((await api('/api/auth/setup','POST',{username:'admin',password:'0123'})).status,200);assert.equal((await api('/api/auth/setup','POST',{username:'admin2',password:'0123'})).status,409);
const session=await api('/api/session');assert.equal(session.body.role,'owner');assert.equal(session.body.hasData,false);
assert.equal((await api('/api/snapshot')).body.data,null);
assert.equal((await api('/api/session','GET',null,'intruder')).status,401);
let upload=await api('/api/sync','POST',{baseRevision:0,requestId:'request-initial-0001',data:fixture});assert.equal(upload.status,200,JSON.stringify(upload));assert.equal(upload.body.revision,1);assert.ok(upload.body.data.audit.some(x=>x.serverVerified&&x.user.id==='owner'));
const stored=structuredClone(upload.body.data);
const replay=await api('/api/sync','POST',{baseRevision:0,requestId:'request-initial-0001',data:fixture});assert.equal(replay.body.replayed,true);assert.equal(replay.body.revision,1);
assert.equal((await api('/api/sync','POST',{baseRevision:0,requestId:'request-stale-00001',data:fixture})).status,409);
assert.equal((await api('/api/sync','POST',{baseRevision:1,requestId:'request-csrf-00001',data:fixture},'owner',undefined,{origin:'https://evil.test'})).status,403);
let member={email:'employee@example.com',username:'employee',password:'12345',name:'کارمند',role:'editor',active:true,permissions:{warehouse:{create:true,edit:true}}};assert.equal((await api('/api/members','POST',member)).status,200);
assert.equal((await api('/api/auth/login','POST',{username:'employee',password:'12345'},'employee')).status,200);const employeeSession=await api('/api/session','GET',null,'employee');const employeeID=employeeSession.body.user.id;assert.equal(employeeSession.body.role,'editor');
assert.equal((await api('/api/members','GET',null,'employee')).status,403);
let edited=structuredClone(stored);edited.products[0].price+=100;edited.products[0].updatedBy={id:'forged',name:'forged'};edited.products[0].createdBy={id:'forged',name:'forged'};edited.audit=[];
let save=await api('/api/sync','POST',{baseRevision:1,requestId:'request-edit-000001',data:edited},'employee');assert.equal(save.status,200,JSON.stringify(save));assert.equal(save.body.data.products[0].updatedBy.id,employeeID);assert.notEqual(save.body.data.products[0].createdBy.id,'forged');assert.ok(save.body.data.audit.length>stored.audit.length);
let bad=structuredClone(save.body.data);bad.parties[0].opening+=100;assert.equal((await api('/api/sync','POST',{baseRevision:2,requestId:'request-bad-perm-01',data:bad},'employee')).status,403);
let forged=structuredClone(save.body.data);forged.products[0].updatedBy={id:'hacker'};let metadata=await api('/api/sync','POST',{baseRevision:2,requestId:'request-metadata-01',data:forged},'employee');assert.equal(metadata.body.data.products[0].updatedBy.id,employeeID);
await api('/api/members','POST',{...member,role:'viewer'});assert.equal((await api('/api/session','GET',null,'employee')).status,401);await api('/api/auth/login','POST',{username:'employee',password:'12345'},'employee');bad=structuredClone(metadata.body.data);bad.products[0].price+=1;assert.equal((await api('/api/sync','POST',{baseRevision:3,requestId:'request-viewer-0001',data:bad},'employee')).status,403);
let broken=structuredClone(metadata.body.data);broken.invoices.push({id:'oversold',number:'F-TEST',type:'sale',date:'2026-11-01',partyId:'c1',warehouseId:'wh-main',discount:0,paid:0,items:[{productId:'p1',name:'watch',code:'BL-1020',qty:9999,price:100}]});assert.throws(()=>validated(broken));assert.equal((await api('/api/sync','POST',{baseRevision:3,requestId:'request-invalid-01',data:broken})).status,422);
assert.equal((await api('/api/snapshot')).body.revision,3);
let a=structuredClone(metadata.body.data),b=structuredClone(a);a.products[0].price+=2;b.products[1].price+=3;
const raced=await Promise.all([api('/api/sync','POST',{baseRevision:3,requestId:'request-race-00001',data:a}),api('/api/sync','POST',{baseRevision:3,requestId:'request-race-00002',data:b})]);assert.deepEqual(raced.map(x=>x.status).sort(),[200,409]);
const rev=await api('/api/revisions');assert.equal(rev.body.revisions.length,4);assert.equal((await api('/api/revisions/1')).body.data.products[0].price,stored.products[0].price);
await api('/api/members','POST',{...member,active:false});assert.equal((await api('/api/snapshot','GET',null,'employee')).status,401);
const mergeSource=fs.readFileSync('public/sync.js','utf8').split('(function(){')[0];const mergeCtx={};vm.createContext(mergeCtx);vm.runInContext(mergeSource,mergeCtx);const merge=(base,local,remote)=>mergeCtx.mergeSnapshots(base,local,remote);
let base=structuredClone(stored),local=structuredClone(base),remote=structuredClone(base);local.products[0].price+=2;remote.products[1].price+=3;let result=merge(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.data.products[0].price,local.products[0].price);assert.equal(result.data.products[1].price,remote.products[1].price);validated(result.data);
remote.products[0].price+=7;assert.equal(merge(base,local,remote).conflicts.length,1);remote=structuredClone(base);remote.products=remote.products.filter(x=>x.id!=='p1');assert.equal(merge(base,local,remote).conflicts.length,1);
const html=await worker.fetch(new Request(ORIGIN+'/'),env);assert.equal(html.status,200);assert.ok((await html.text()).includes('sync.js'));assert.equal((await worker.fetch(new Request(ORIGIN+'/not-found'),env)).status,404);
console.log('PASS: authenticated durable sync, CAS and races, idempotency, server permissions, audit identity, invalid stock rollback, immutable revision backups and conflict-safe merge');
// Two isolated browser contexts exercise the actual offline client and API together.
function browser(){
 const data={},el={open:false,addEventListener(){},classList:{remove(){}},value:'',innerHTML:'',textContent:'',close(){this.open=false},click(){},remove(){},showModal(){this.open=true}};
 let loseAck=false;const window={addEventListener(){}};
 const context={console,crypto,Intl,Date,Set,Map,TextDecoder,TextEncoder,URL,Blob,Response,Request,DecompressionStream,AbortSignal,document:{querySelector:()=>el,getElementById:()=>el,createElement:()=>({...el}),body:{append(){}}},localStorage:{getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=v},setTimeout(){},clearTimeout(){},setInterval(){},navigator:{onLine:true},window};
 context.fetch=async(path,opts={})=>{const request=new Request(ORIGIN+path,{...opts,headers:{...opts.headers,origin:ORIGIN,'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com',cookie:cookies.owner}});const response=await worker.fetch(request,env);if(loseAck&&path==='/api/sync'){loseAck=false;throw Error('simulated lost acknowledgement')}return response};
 vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf("$('#today').textContent")),context);vm.runInContext('render=()=>{};toast=()=>{};show=()=>{}',context);vm.runInContext(fs.readFileSync('public/sync.js','utf8'),context);
 return {ctx:context,data,run:s=>vm.runInContext(s,context),async connect(){await context.window.MavonSync.connect();await context.window.MavonSync.useRemote()},async sync(){await context.window.MavonSync.syncNow()},async merge(){await context.window.MavonSync.merge()},loseAck(){loseAck=true}};
}
const deviceA=browser(),deviceB=browser();await deviceA.connect();await deviceB.connect();const initialPrice=deviceA.run('state.products[0].price');deviceA.ctx.navigator.onLine=false;assert.equal(deviceA.run('commit(()=>state.products[0].price+=11)'),true);assert.equal(JSON.parse(deviceA.data['mavon-finance-live-v1']).products[0].price,initialPrice+11);assert.equal(deviceA.ctx.window.MavonSync.actor().id,'owner');
deviceB.run('commit(()=>state.products[1].price+=13)');await deviceB.sync();deviceA.ctx.navigator.onLine=true;await deviceA.sync();assert.equal(deviceA.run('state.products[0].price'),initialPrice+11);await deviceA.merge();let latest=(await api('/api/snapshot')).body;assert.equal(latest.data.products[0].price,initialPrice+11);assert.equal(deviceA.run('state.products[1].price'),latest.data.products[1].price);
await deviceB.sync();deviceA.run('commit(()=>state.products[0].price+=17)');deviceB.run('commit(()=>state.products[0].price+=19)');await deviceB.sync();await deviceA.sync();const conflictPrice=deviceA.run('state.products[0].price');await deviceA.merge();assert.equal(deviceA.run('state.products[0].price'),conflictPrice);assert.notEqual((await api('/api/snapshot')).body.data.products[0].price,conflictPrice);await deviceA.ctx.window.MavonSync.useRemote();
deviceA.run('commit(()=>state.products[2].price+=23)');deviceA.loseAck();await deviceA.sync();let afterLost=(await api('/api/snapshot')).body;assert.notEqual(JSON.parse(deviceA.data['mavon-cloud-live-v1']).revision,afterLost.revision);await deviceA.sync();assert.equal(JSON.parse(deviceA.data['mavon-cloud-live-v1']).revision,afterLost.revision);assert.equal((await api('/api/snapshot')).body.revision,afterLost.revision);
console.log('PASS: two-device client integration, durable offline edits, independent merge, same-record conflict preservation and lost-ack idempotent recovery');
// Passwords are independent per user; resets revoke sessions and hashes stay server-side.
assert.equal((await api('/api/auth/logout','POST',{})).status,200);assert.equal((await api('/api/session')).status,401);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'wrong-password'})).status,401);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'0123'})).status,200);
assert.equal((await api('/api/auth/password','POST',{oldPassword:'0123',password:'012345'})).status,200);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'0123'})).status,401);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'012345'})).status,200);
const secretRow=db.prepare('SELECT * FROM credentials WHERE username=?').get('admin');assert.equal(secretRow.hash.length,64);assert.notEqual(secretRow.hash,'012345');assert.ok(!JSON.stringify((await api('/api/members')).body).includes(secretRow.hash));
for(let i=0;i<8;i++)assert.equal((await api('/api/auth/login','POST',{username:'unknown-user',password:'wrong-password'})).status,401);assert.equal((await api('/api/auth/login','POST',{username:'unknown-user',password:'wrong-password'})).status,429);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'012345'},'owner',undefined,{origin:'https://evil.test'})).status,403);
assert.equal((await api('/api/members','POST',{username:'shortpass',name:'Bad',password:'123',role:'viewer'})).status,400);
assert.equal((await api('/api/members','POST',{...member,username:'admin',email:'someone@example.com'})).status,400);
console.log('PASS: independent password login, setup-once, salted hashing, password changes, logout, session revocation, brute-force throttling, CSRF and no credential disclosure');
// Exercise the real login UI, including cached offline password verification.
const authElements={},authData={},authBody={classList:{add(){},remove(){}}};function ae(id){return authElements[id]||= {hidden:false,innerHTML:'',textContent:'',onsubmit:null,close(){}}}
const authWindow={MavonSync:{canSwitch:()=>true,async refreshIdentity(i){this.info=i}}};
const authContext={console,crypto,TextEncoder,Uint8Array,Date,JSON,Object,FormData:class{constructor(form){this.rows=Object.entries(form.data)}[Symbol.iterator](){return this.rows[Symbol.iterator]()}},AbortSignal,document:{getElementById:ae,body:authBody},localStorage:{getItem:k=>authData[k]||null,setItem:(k,v)=>authData[k]=v},navigator:{onLine:true},window:authWindow,render(){},moduleOf:x=>x,toast(){},$:()=>({close(){}})};
authContext.fetch=async(path,options={})=>{const response=await worker.fetch(new Request(ORIGIN+path,{...options,headers:{...options.headers,origin:ORIGIN,'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com',cookie:cookies.owner}}),env);if(response.headers.get('set-cookie'))cookies.owner=response.headers.get('set-cookie').split(';')[0];return response};
vm.createContext(authContext);vm.runInContext(fs.readFileSync('public/auth.js','utf8'),authContext);for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
const loginForm={data:{username:'admin',password:'wrong'},querySelector:()=>({disabled:false}),reset(){}};await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,false);
loginForm.data.password='012345';await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,true);assert.ok(!JSON.stringify(authData).includes('012345'));await authWindow.MavonAuth.logout();authContext.navigator.onLine=false;await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,true);await authWindow.MavonAuth.logout();loginForm.data.password='wrong-offline';await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,false);
console.log('PASS: login UI locks, successful online entry, no plaintext browser password, offline verification and wrong-password rejection');
// Numeric PIN policy is enforced server-side and preserves leading zeroes.
await api('/api/auth/login','POST',{username:'admin',password:'۰۱۲۳۴۵'});
for(const password of ['', '123', '1234567', '12a4', '12 34', '12.34', '-123', 1234])assert.equal((await api('/api/members','POST',{username:'pin-invalid',name:'Invalid',password,role:'viewer'})).status,400,JSON.stringify(password));
for(const [username,password,latin,arabic] of [['pin-four','۰۰۱۲','0012','٠٠١٢'],['pin-five','01234','01234','٠١٢٣٤'],['pin-six','۰۰۱۲۳۴','001234','٠٠١٢٣٤']]){
 assert.equal((await api('/api/members','POST',{username,name:username,password,role:'viewer'})).status,200);
 assert.equal((await api('/api/auth/login','POST',{username,password:latin},username)).status,200);
 assert.equal((await api('/api/auth/login','POST',{username,password:arabic},username)).status,200);
 assert.equal((await api('/api/auth/login','POST',{username,password:String(Number(latin))},username)).status,401);
}
assert.equal((await api('/api/auth/password','POST',{oldPassword:'۰۱۲۳۴۵',password:'۹۸۷۶'})).status,200);
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'9876'})).status,200);
// Offline login normalizes the new Persian/Arabic numeric passwords too.
authContext.navigator.onLine=true;loginForm.data.password='۹۸۷۶';await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,true);await authWindow.MavonAuth.logout();authContext.navigator.onLine=false;loginForm.data.password='٩٨٧٦';await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,true);
console.log('PASS: 4/5/6-digit PINs, rejected letters/short/long/non-string values, Persian and Arabic digits, leading zero preservation and offline PIN entry');
// Owner-only setup/recovery and a memory-only bearer session work without cookies.
await api('/api/auth/login','POST',{username:'admin',password:'9876'});const beforeRecovery=(await api('/api/snapshot')).body;
assert.equal((await api('/api/auth/recover','POST',{username:'hijack',password:'0042'},'intruder')).status,403);
const recovery=await api('/api/auth/recover','POST',{username:'admin-recovered',password:'۰۰۴۲'});assert.equal(recovery.status,200);assert.equal(typeof recovery.body.sessionToken,'string');
const bearer={cookie:'',authorization:'Bearer '+recovery.body.sessionToken};assert.equal((await api('/api/session','GET',null,'owner',undefined,bearer)).status,200);assert.equal((await api('/api/session','GET',null,'intruder',undefined,bearer)).status,401);
assert.equal((await api('/api/session','GET',null,'owner',undefined,{cookie:''})).status,401);
assert.equal(JSON.stringify((await api('/api/snapshot','GET',null,'owner',undefined,bearer)).body),JSON.stringify(beforeRecovery));
assert.equal((await api('/api/auth/login','POST',{username:'admin',password:'9876'})).status,401);
authContext.navigator.onLine=true;
authContext.fetch=async(path,options={})=>worker.fetch(new Request(ORIGIN+path,{...options,headers:{...options.headers,origin:ORIGIN,'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'}}),env);
await authWindow.MavonAuth.firstSetup();assert.ok(ae('authGate').innerHTML.includes('بازیابی حساب مدیر'));loginForm.data={username:'my-admin',password:'۰۰۶۶',confirm:'0066'};await ae('loginForm').onsubmit({preventDefault(){},target:loginForm});assert.equal(authWindow.MavonAuth.unlocked,true);assert.equal(authWindow.MavonAuth.user.username,'my-admin');assert.ok(authWindow.MavonAuth.authorization().Authorization.startsWith('Bearer '));assert.ok(!JSON.stringify(authData).includes(recovery.body.sessionToken));
await authWindow.MavonAuth.logout();assert.deepEqual(Object.keys(authWindow.MavonAuth.authorization()),[]);
console.log('PASS: owner-only recovery, unchanged financial records, cookie-free session entry, platform binding, explicit first-setup UI and token clearing on logout');
