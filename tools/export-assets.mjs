// Deterministic export only: no generated content is changed. Requires sharp in ../.tools.
import sharp from '../.tools/node_modules/sharp/dist/index.mjs';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('frontend/public/assets');
const [portraits,scene]=process.argv.slice(2);
if(!portraits||!scene)throw Error('Usage: node tools/export-assets.mjs PORTRAIT_SHEET SCENE');
await mkdir(root+'/portraits',{recursive:true});await mkdir(root+'/scenes',{recursive:true});
const ids=['xuan-1','xuan-2','yu-1','yu-2','lin-1','lin-2','chen'];
const meta=await sharp(portraits).metadata(),assets=[];
for(let i=0;i<ids.length;i++){
 const left=Math.round(i*meta.width/7),right=Math.round((i+1)*meta.width/7);
 for(const thumb of [false,true]){
  const file=`portraits/${ids[i]}${thumb?'-thumb':''}.webp`;
  let pipe=sharp(portraits).extract({left,top:0,width:right-left,height:thumb?345:Math.min(620,meta.height)});
  if(thumb)pipe=pipe.resize(128,148,{fit:'cover',position:'top'});
  const out=await pipe.webp({quality:thumb?78:85}).toFile(root+'/'+file);
  assets.push({id:ids[i]+(thumb?'-thumb':''),path:'/assets/'+file,role:ids[i].split('-')[0],width:out.width,height:out.height,bytes:out.size,source:'Original fictional artwork generated for this project on 2026-11-26',license:'AI-generated original game artwork; not represented as CC0'});
 }
}
const out=await sharp(scene).resize(1440,810,{fit:'cover'}).webp({quality:82}).toFile(root+'/scenes/account.webp');
assets.push({id:'account-scene',path:'/assets/scenes/account.webp',width:out.width,height:out.height,bytes:out.size,source:'Original fictional game scene generated on 2026-11-26',license:'AI-generated original game artwork; not represented as CC0'});
await writeFile(root+'/manifest.images.json',JSON.stringify(assets,null,2));
console.log(assets.map(a=>`${a.id}: ${a.bytes} bytes`).join('\n'));
