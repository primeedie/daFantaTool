import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),out=resolve(root,'dist');
await mkdir(resolve(out,'fonts'),{recursive:true});
// Only ship the reviewed public snapshot and the listed assets.
for(const file of ['app.js','style.css','font.css','model.mjs','public-ui.mjs','fonts/slam-dunk.otf','fonts/LICENSE.txt','public-league.json','manager-verifiers.json'])await copyFile(resolve(root,'dashboard',file),resolve(out,file));
const html=await readFile(resolve(root,'dashboard/index.html'),'utf8');
await writeFile(resolve(out,'index.html'),html.replace('<html lang="en">','<html lang="en" data-public-league>'));
const folder=process.env.FANTASY_DATA_DIR||resolve(root,'../../data/private');
const feed=JSON.parse(await readFile(resolve(folder,'public-feed.json'),'utf8'));
const {source,sourceUrl,updatedAt,nbaDate,window,refreshIntervalMinutes,partial,refreshedDates,games,logs}=feed;
if(!Array.isArray(games)||!Array.isArray(logs)||!updatedAt)throw new Error('No valid public feed');
await writeFile(resolve(out,'public-feed.json'),JSON.stringify({source,sourceUrl,updatedAt,nbaDate,window,refreshIntervalMinutes,partial,refreshedDates,games,logs}));
await writeFile(resolve(out,'.nojekyll'),'');
console.log(`Pages ready: league snapshot, ${games.length} games, ${logs.length} player logs.`);
