import {packager} from '@electron/packager';
import fs from 'node:fs';
fs.rmSync('desktop/app/public',{recursive:true,force:true});fs.cpSync('public','desktop/app/public',{recursive:true});
const results=await packager({dir:'desktop/app',name:'Mavon Finance',platform:'darwin',arch:'arm64',electronVersion:'45.2.1',icon:'desktop/icon.icns',out:'release',overwrite:true,asar:true,appBundleId:'com.mavon.finance',appCategoryType:'public.app-category.finance',osxSign:false,prune:false});
console.log(JSON.stringify({packages:results}));
