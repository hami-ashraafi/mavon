import {spawn,spawnSync} from 'node:child_process';
const args=process.argv.slice(2),portIndex=args.indexOf('--port');
const port=portIndex>=0?args[portIndex+1]:(process.env.PORT||'3000');
if(!/^\d+$/.test(port))throw Error('Invalid dev port');
const bin='node_modules/wrangler/bin/wrangler.js';
const migration=spawnSync(process.execPath,[bin,'d1','migrations','apply','DB','--local'],{stdio:'inherit'});if(migration.status!==0)process.exit(migration.status||1);
const child=spawn(process.execPath,[bin,'dev','--ip','0.0.0.0','--port',port],{stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code||0));
