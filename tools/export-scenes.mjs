import sharp from '../.tools/node_modules/sharp/dist/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const root='frontend/public/assets';
const assets=JSON.parse(await readFile(root+'/manifest.json','utf8'));
for(const [i,id] of ['hall','bedroom','courtyard'].entries()){
 const source=process.argv[2+i];if(!source)throw Error('Supply hall, bedroom and courtyard image paths');
 const out=await sharp(source).resize(1440,810,{fit:'cover'}).webp({quality:82}).toFile(`${root}/scenes/${id}.webp`);
 const entry={id:`${id}-scene`,path:`/assets/scenes/${id}.webp`,width:out.width,height:out.height,bytes:out.size,source:'Original fictional game scene generated on 2026-11-26',license:'AI-generated original game artwork; not represented as CC0'};
 const existing=assets.findIndex(a=>a.id===entry.id);if(existing<0)assets.push(entry);else assets[existing]=entry;
}
await writeFile(root+'/manifest.json',JSON.stringify(assets,null,2));console.log('3 investigation scene exports ready');
