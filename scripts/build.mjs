import fs from 'node:fs';
import path from 'node:path';
const app=fs.readFileSync('public/app.js','utf8');
const core=app.slice(0,app.indexOf("$('#today').textContent"));
// Reuse the exact financial rules, isolated in a fresh closure per request.
const validator=`function validateSnapshot(input){
const location=undefined,MutationObserver=undefined,window={},navigator={};
const element={addEventListener(){},classList:{remove(){}},value:'',innerHTML:'',textContent:''};
const document={querySelector:()=>element,body:element};
const localStorage={getItem:k=>k==='mavon-finance-live-v1'?JSON.stringify(input):null,setItem(){}};
${core}
validateFinancialState();return state;
}\n`;
const files={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walk(full);else{const key='/'+path.relative('public',full).split(path.sep).join('/');files[key]=fs.readFileSync(full).toString('base64')}}}
walk('public');
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',validator+`const ASSETS=${JSON.stringify(files)};\n`+fs.readFileSync('worker/auth.js','utf8')+'\n'+fs.readFileSync('worker/api.js','utf8'));
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
fs.writeFileSync('worker/validator.generated.js',validator+'export {validateSnapshot};\n');
console.log('Built Worker with embedded frontend assets and shared financial validation');
