import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {leaguePositions} from './dashboard/model.mjs';
const root=dirname(fileURLToPath(import.meta.url)),out=resolve(root,'dist');
await mkdir(resolve(out,'fonts'),{recursive:true});
// Only ship the reviewed public snapshot and the listed assets.
for(const file of ['app.js','entry.mjs','theme.mjs','trading.html','trading.css','trading.mjs','trade-model.mjs','saved-rosters.mjs','big-balls.mjs','entry-access.json','style.css','font.css','model.mjs','public-ui.mjs','fonts/slam-dunk.otf','fonts/LICENSE.txt','public-league.json','player-logo.png','dafantatool-wordmark.png'])await copyFile(resolve(root,'dashboard',file),resolve(out,file));
await copyFile(resolve(root,'dashboard/entry.html'),resolve(out,'index.html'));
const html=await readFile(resolve(root,'dashboard/index.html'),'utf8');
await writeFile(resolve(out,'dashboard.html'),html.replace('<html lang="en">','<html lang="en" data-public-league>'));
const folder=process.env.FANTASY_DATA_DIR||resolve(root,'../../data/private');
const tradeSeed=JSON.parse(await readFile(resolve(root,'dashboard/trade-data.json'),'utf8'));
let tradeCache;
try {tradeCache=JSON.parse(await readFile(resolve(folder,'trade-data.json'),'utf8'));} catch {}
const useTradeCache=tradeCache?.analysisVersion===tradeSeed.analysisVersion&&tradeCache?.updatedAt>tradeSeed.updatedAt;
if(useTradeCache){
 const cachedIds=new Set(tradeCache.players.map(player=>player.id));
 tradeCache.players.push(...tradeSeed.players.filter(player=>!cachedIds.has(player.id)));
}
await writeFile(resolve(out,'trade-data.json'),JSON.stringify(useTradeCache?tradeCache:tradeSeed));
const tradeInjuries=await readFile(resolve(folder,'trade-injuries.json'),'utf8').catch(()=>readFile(resolve(root,'dashboard/trade-injuries.json'),'utf8'));
await writeFile(resolve(out,'trade-injuries.json'),tradeInjuries);
const historySeed=JSON.parse(await readFile(resolve(root,'dashboard/trade-injury-history.json'),'utf8'));
const historyCache=await readFile(resolve(folder,'trade-injury-history.json'),'utf8').then(JSON.parse).catch(()=>null);
await writeFile(resolve(out,'trade-injury-history.json'),JSON.stringify(historyCache?.asOf>historySeed.asOf?historyCache:historySeed));
const feed=JSON.parse(await readFile(resolve(folder,'public-feed.json'),'utf8'));
const {source,sourceUrl,updatedAt,nbaDate,window,refreshIntervalMinutes,partial,refreshedDates,games,logs,defense}=feed;
if(!Array.isArray(games)||!Array.isArray(logs)||!updatedAt)throw new Error('No valid public feed');
await writeFile(resolve(out,'public-feed.json'),JSON.stringify({source,sourceUrl,updatedAt,nbaDate,window,refreshIntervalMinutes,partial,refreshedDates,games,logs}));
const positions=leaguePositions(JSON.parse(await readFile(resolve(root,'dashboard/public-league.json'),'utf8')));
await writeFile(resolve(out,'trade-outlook.json'),JSON.stringify({sourceUrl,updatedAt,window,games,defense,refreshedDates,positions}));
await writeFile(resolve(out,'.nojekyll'),'');
console.log(`Pages ready: league snapshot, ${games.length} games, ${logs.length} player logs.`);
