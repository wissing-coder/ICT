// Local, read-only bridge for uploading source through the connected GitHub tool.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const allowedRoots=['backend/src','backend/.mvn','frontend/src','frontend/public','tools','sql/migrations','docs/backend-core'];
const singles=['.gitignore','AGENTS.md','README.md','FORMAL_VERSION.md','FORMAL_ACCEPTANCE.md','start-formal.cmd','backend/pom.xml','backend/.env.example','backend/.gitignore','backend/.gitattributes','backend/mvnw','backend/mvnw.cmd','backend/BACKEND_CORE_ORIGIN.md','frontend/package.json','frontend/package-lock.json','frontend/index.html','frontend/vite.config.js'];
function files(dir){return readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name]);}
const paths=[...new Set([...singles,...allowedRoots.flatMap(files)])].sort();
function read(path){if(!paths.includes(path))throw Error('Not in source upload list');const abs=resolve(root,path);if(!abs.startsWith(root+sep))throw Error('Outside project');return readFileSync(abs);}
if(process.argv[2]==='list')console.log(JSON.stringify(paths.map(path=>{const b=read(path);return {path,size:b.length,sha:createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};})));
else if(process.argv[2]==='data'){const b=read(process.argv[3]),offset=Number(process.argv[4]);console.log(b.subarray(offset,offset+16383).toString('base64'));}
else throw Error('Usage: github-sync-export.mjs list | data PATH BYTE_OFFSET');
