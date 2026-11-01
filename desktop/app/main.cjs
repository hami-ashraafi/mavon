const {app,BrowserWindow,session,net,Menu,shell,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const ORIGIN='https://mavon-finance-moein.sturdylion256.chatgpt.site';
app.setName('Mavon Finance');
app.enableSandbox();
const assets=path.join(__dirname,'public');
function safeExternal(url){try{return ['https:','http:'].includes(new URL(url).protocol)}catch{return false}}
function secureWindow(win){win.webContents.on('will-navigate',(event,url)=>{if(!safeExternal(url))event.preventDefault()});win.webContents.setWindowOpenHandler(({url})=>{if(!safeExternal(url))return {action:'deny'};return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}}});win.webContents.on('did-create-window',secureWindow)}
app.whenReady().then(async()=>{
 const ses=session.defaultSession;
 ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 // Locally packaged assets use the production origin, including its cookies.
 // API/auth requests always reach the server; frontend files remain available offline.
 ses.protocol.handle('https',async request=>{
  const url=new URL(request.url),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(url.origin===ORIGIN&&request.method==='GET'&&!name.startsWith('api/')&&!name.includes('..')){
   const file=path.join(assets,name);
   if(fs.existsSync(file)&&fs.statSync(file).isFile()){
    const type={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json',png:'image/png',svg:'image/svg+xml',zip:'application/zip'}[path.extname(file).slice(1)]||'application/octet-stream';
    return new Response(fs.readFileSync(file),{headers:{'Content-Type':type,'Cache-Control':'no-cache'}});
   }
  }
  return ses.fetch(request,{bypassCustomProtocolHandlers:true,redirect:'manual'});
 });
 function open(){const win=new BrowserWindow({width:1440,height:940,minWidth:850,minHeight:600,title:'ماوون | مدیریت مالی',backgroundColor:'#f8f7f8',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});secureWindow(win);win.loadURL(ORIGIN+'/');return win}
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Mavon Finance',submenu:[{role:'about'},{role:'quit'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},{label:'Help',submenu:[{label:'Installation guide',click:()=>shell.openExternal(ORIGIN+'/install.html')}]}]));
 open();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)open()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
