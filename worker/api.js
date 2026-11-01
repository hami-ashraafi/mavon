const ENTITIES=['products','parties','groups','invoices','payments','checks','returns','staff','warehouses','transfers'];
const MODULES={products:'warehouse',parties:'details',groups:'details',invoices:'trade',payments:'finance',checks:'finance',returns:'trade',staff:'access',warehouses:'warehouse',transfers:'warehouse'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function identity(req){const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();if(!id||!email)fail('ابتدا با حساب ChatGPT اجازه ورود به سایت خصوصی را بگیرید.',401);return {id,email,name:email,verified:true}}
async function session(req,db){return passwordSession(req,db)}

function permissions(member){try{return JSON.parse(member.permissions)}catch{return {}}}
function changedRecords(before,after){const out=[];for(const entity of ENTITIES){const old=new Map((before?.[entity]||[]).map(x=>[x.id,x])),next=new Map((after[entity]||[]).map(x=>[x.id,x]));for(const [id,row] of next){const prior=old.get(id);const clean=x=>Object.fromEntries(Object.entries(x||{}).filter(([k])=>!['createdAt','createdBy','updatedAt','updatedBy'].includes(k)));if(JSON.stringify(clean(prior))!==JSON.stringify(clean(row)))out.push({entity,id,before:prior,after:row,action:prior?'update':'create'})}for(const [id,row] of old)if(!next.has(id))out.push({entity,id,before:row,after:null,action:'delete'})}return out}
function authorizeChanges(member,before,after,changes){
 if(member.role==='owner')return;
 if(!before||member.role==='viewer')fail('اجازه ارسال تغییرات ندارید.',403);
 const rules=permissions(member);
 for(const c of changes){let module=MODULES[c.entity],action=c.before?'edit':'create';if(c.entity==='staff')fail('پرسنل فقط توسط مدیر قابل تغییر است.',403);const fields=Object.keys({...c.before,...c.after}).filter(k=>!['createdAt','createdBy','updatedAt','updatedBy'].includes(k)&&JSON.stringify(c.before?.[k])!==JSON.stringify(c.after?.[k]));if(c.entity==='products'&&c.before&&c.after&&fields.every(k=>['price','cost'].includes(k))&&rules.trade?.edit)continue;if(!rules[module]?.[action])fail('اجازه ثبت یا اصلاح در بخش '+module+' ندارید.',403)}
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!ENTITIES.includes(key)&&key!=='audit'&&JSON.stringify(before[key])!==JSON.stringify(after[key]))fail('اجازه تغییر تنظیمات پایه ندارید.',403);
}
function validated(data){
 if(!data||data.schemaVersion!==1||data.currency!=='IRR'||data.checkAccounting!=='receipt'||data.warehouseSchema!==1)fail('ساختار یا نسخه اطلاعات معتبر نیست.');
 if(new TextEncoder().encode(JSON.stringify(data)).length>1_200_000)fail('حجم این نسخه از ظرفیت همگام‌سازی بیشتر است؛ پشتیبان بگیرید و با پشتیبانی تماس بگیرید.',413);
 const result=validateSnapshot(data);
 for(const entity of ['invoices','returns','transfers']){const seen=new Set();for(const row of result[entity]){const key=(row.type||'')+'|'+row.number;if(!row.number||seen.has(key))fail('شماره سند تکراری یا خالی است: '+row.number);seen.add(key)}}
 return result;
}
function canonical(before,data,user,changes){
 const result=JSON.parse(JSON.stringify(data)),now=new Date().toISOString();
 if(before)result.audit=JSON.parse(JSON.stringify(before.audit||[]));
 for(const c of changes){const r=result[c.entity].find(x=>x.id===c.id);if(r){r.createdAt=c.before?(c.before.createdAt??null):(before?now:r.createdAt??now);r.createdBy=c.before?(c.before.createdBy??null):(before?user:r.createdBy??user);r.updatedAt=now;r.updatedBy=user}result.audit.push({id:crypto.randomUUID(),entity:c.entity,entityId:c.id,action:c.action,at:now,user,serverVerified:true,changes:Object.keys({...c.before,...c.after}).filter(k=>!['createdAt','createdBy','updatedAt','updatedBy'].includes(k)&&JSON.stringify(c.before?.[k])!==JSON.stringify(c.after?.[k])).map(field=>({field,before:c.before?.[field]??null,after:c.after?.[field]??null})),snapshot:r||c.before})}
 // Unchanged records retain authoritative metadata, even if a client changed only metadata.
 if(before)for(const entity of ENTITIES)for(const r of result[entity])if(!changes.some(c=>c.entity===entity&&c.id===r.id)){const old=before[entity].find(x=>x.id===r.id);if(old)for(const key of ['createdAt','createdBy','updatedAt','updatedBy']){if(key in old)r[key]=old[key];else delete r[key]}}
 return validated(result);
}
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail('نوع درخواست معتبر نیست.',415);if(Number(req.headers.get('content-length')||0)>1_500_000)fail('درخواست بیش از حد بزرگ است.',413);const text=await req.text();if(new TextEncoder().encode(text).length>1_500_000)fail('درخواست بیش از حد بزرگ است.',413);try{return JSON.parse(text)}catch{fail('اطلاعات ارسالی معتبر نیست.')}}
async function api(req,env){
 if(!env.DB)fail('پایگاه داده در دسترس نیست.',503);
 const url=new URL(req.url);if(req.method!=='GET'){if(req.headers.get('origin')!==url.origin)fail('مبدأ درخواست معتبر نیست.',403)}
 if(url.pathname.startsWith('/api/auth/'))return authRoutes(req,env.DB);
 const {user,member,ws}=await session(req,env.DB),db=env.DB;
 if(url.pathname==='/api/session'&&req.method==='GET')return json({user,role:member.role,permissions:permissions(member),revision:ws.revision,hasData:!!ws.payload});
 if(url.pathname==='/api/snapshot'&&req.method==='GET')return json({revision:ws.revision,data:ws.payload?JSON.parse(ws.payload):null,updatedAt:ws.updated_at});
 if(url.pathname==='/api/sync'&&req.method==='POST'){
  const input=await body(req);if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0||!/^[-\w]{10,80}$/.test(input.requestId||''))fail('شماره نسخه یا شناسه درخواست معتبر نیست.');
  const prior=await db.prepare('SELECT revision,actor_id,payload FROM live_commits WHERE id=?').bind(input.requestId).first();if(prior){if(prior.actor_id!==user.id)fail('شناسه درخواست تکراری است.',409);return json({revision:prior.revision,data:JSON.parse(prior.payload),replayed:true})}
  if(input.baseRevision!==ws.revision)return json({error:'تغییرات دستگاه دیگری روی سرور ثبت شده است.',conflict:true,revision:ws.revision,data:ws.payload?JSON.parse(ws.payload):null},409);
  const before=ws.payload?JSON.parse(ws.payload):null,next=validated(input.data),changes=changedRecords(before,next);authorizeChanges(member,before,next,changes);
  const result=canonical(before,next,user,changes),payload=JSON.stringify(result),now=new Date().toISOString();
  const batch=await db.batch([
   db.prepare('INSERT INTO live_commits(id,revision,actor_id,actor_email,at,payload) SELECT ?,revision+1,?,?,?,? FROM live_workspace WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM members WHERE email=? AND active=1 AND updated_at=?)').bind(input.requestId,user.id,user.email,now,payload,input.baseRevision,user.email,member.updated_at),
   db.prepare('UPDATE live_workspace SET payload=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM live_commits WHERE id=? AND revision=live_workspace.revision+1)').bind(payload,now,input.baseRevision,input.requestId)
  ]);
  if(batch[0].meta.changes!==1){const latest=await db.prepare('SELECT * FROM live_workspace WHERE id=1').first();return json({error:'نسخه سرور یا دسترسی شما تغییر کرد؛ دوباره بررسی کنید.',conflict:true,revision:latest.revision,data:latest.payload?JSON.parse(latest.payload):null},409)}
  return json({revision:input.baseRevision+1,data:result,updatedAt:now});
 }
 if(url.pathname==='/api/members'){
  if(member.role!=='owner')fail('مدیریت کاربران فقط برای مدیر است.',403);
  if(req.method==='GET'){const rows=await db.prepare('SELECT m.email,m.name,m.role,m.permissions,m.active,m.user_id,m.updated_at,c.username FROM members m LEFT JOIN credentials c ON c.email=m.email ORDER BY m.role,m.name').all();return json({members:rows.results.map(r=>({...r,permissions:JSON.parse(r.permissions)}))})}
  if(req.method==='POST'){
   const d=await body(req),username=usernameOf(d.username),email=d.email||username+'@personnel.local';if(!String(d.name||'').trim()||!['editor','viewer'].includes(d.role))fail('نام و نقش معتبر وارد کنید.');
   const old=await db.prepare('SELECT * FROM members WHERE email=?').bind(email).first(),existingCredential=await db.prepare('SELECT * FROM credentials WHERE email=?').bind(email).first();if(old?.role==='owner')fail('حساب مدیر اصلی قابل محدود کردن نیست.');if(existingCredential&&existingCredential.username!==username)fail('نام کاربری حساب موجود قابل تغییر نیست.');const taken=await db.prepare('SELECT email FROM credentials WHERE username=?').bind(username).first();if(taken&&taken.email!==email)fail('نام کاربری تکراری است.');if(!existingCredential&&!d.password)fail('برای کاربر جدید رمز وارد کنید.');const credential=d.password?await credentialsFor(username,d.password):null;
   const rules={};for(const m of ['accounts','details','finance','warehouse','trade'])rules[m]={view:true,create:d.role==='editor'&&!!d.permissions?.[m]?.create,edit:d.role==='editor'&&!!d.permissions?.[m]?.edit};const now=new Date().toISOString();
   const writes=[db.prepare("INSERT INTO members(email,name,role,permissions,active,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,permissions=excluded.permissions,active=excluded.active,updated_at=excluded.updated_at").bind(email,String(d.name).trim().slice(0,100),d.role,JSON.stringify(rules),d.active===false?0:1,now),db.prepare('INSERT INTO security_log(id,actor_id,at,detail) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.id,now,JSON.stringify({action:'member-update',username,role:d.role,permissions:rules,active:d.active!==false}))];if(!old)writes.push(db.prepare('UPDATE members SET user_id=? WHERE email=?').bind('personnel-'+crypto.randomUUID(),email));if(credential)writes.push(db.prepare('INSERT INTO credentials(username,email,salt,hash,version) VALUES(?,?,?,?,1) ON CONFLICT(email) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,version=credentials.version+1').bind(username,email,credential.salt,credential.hash));writes.push(db.prepare('DELETE FROM auth_sessions WHERE email=?').bind(email));await db.batch(writes);return json({ok:true});
  }
 }
 if(url.pathname==='/api/revisions'&&req.method==='GET'){if(member.role!=='owner')fail('اجازه مشاهده نسخه‌های سرور ندارید.',403);const rows=await db.prepare('SELECT id,revision,actor_email,at FROM live_commits ORDER BY revision DESC LIMIT 50').all();return json({revisions:rows.results})}
 if(/^\/api\/revisions\/\d+$/.test(url.pathname)&&req.method==='GET'){if(member.role!=='owner')fail('اجازه دریافت نسخه پشتیبان سرور ندارید.',403);const row=await db.prepare('SELECT revision,payload,at FROM live_commits WHERE revision=?').bind(Number(url.pathname.split('/').pop())).first();if(!row)fail('نسخه پیدا نشد.',404);return json({revision:row.revision,data:JSON.parse(row.payload),at:row.at})}
 fail('مسیر پیدا نشد.',404);
}
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',png:'image/png',zip:'application/zip'};
export default {async fetch(req,env){try{const url=new URL(req.url);if(url.pathname.startsWith('/api/'))return await api(req,env);if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});const name=url.pathname==='/'?'/index.html':url.pathname,asset=ASSETS[name];if(!asset)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(asset),c=>c.charCodeAt(0));return new Response(req.method==='HEAD'?null:bytes,{headers:{'Content-Type':TYPES[name.split('.').pop()]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...(name==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})}})}catch(e){return json({error:e.status?e.message:'ثبت یا بررسی اطلاعات انجام نشد؛ نسخه محلی محفوظ است.',...(e.status?{}:{validation:String(e.message).slice(0,250)})},e.status||422)}}};
export {validated,canonical,changedRecords,authorizeChanges};
