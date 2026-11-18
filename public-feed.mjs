import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
export const dataDir=process.env.FANTASY_DATA_DIR||resolve(root,'../../data/private');
const base='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const abbr={NY:'NYK',SA:'SAS',GS:'GSW',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX'};
const teamCode=v=>abbr[v]||v;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function fantasyPoints(s){return s.pts+1.2*s.reb+1.5*s.ast+3*s.st+3*s.blk-1.5*s.to;}
export function nameKey(name){return name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\b(jr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');}
export function normalizeEvent(event,gameDate){
 const competition=event.competitions?.[0],home=competition?.competitors?.find(c=>c.homeAway==='home'),away=competition?.competitors?.find(c=>c.homeAway==='away');
 if(!event.id||!home?.team?.abbreviation||!away?.team?.abbreviation||!event.date||!Number.isFinite(Date.parse(event.date)))return null;
 const completed=event.status?.type?.completed===true;
 const score=c=>c.score===undefined||c.score===''?null:Number(c.score);
 return {id:event.id,date:event.date,gameDate,home:teamCode(home.team.abbreviation),away:teamCode(away.team.abbreviation),homeScore:score(home),awayScore:score(away),completed,status:event.status?.type?.shortDetail||'Scheduled',sourceUrl:event.links?.find(l=>l.rel?.includes('summary'))?.href||`https://www.espn.com/nba/game/_/gameId/${event.id}`};
}
export function normalizeBox(summary,event){
 const logs=[];
 for(const group of summary.boxscore?.players||[]){
   for(const block of group.statistics||[]){
     const labels=block.labels||[];
     for(const row of block.athletes||[]){
       if(row.didNotPlay||!row.athlete?.displayName)continue;
       const index=Object.fromEntries(labels.map((l,i)=>[l,row.stats?.[i]]));
       const fields={pts:'PTS',reb:'REB',ast:'AST',st:'STL',blk:'BLK',to:'TO'};
       const stats={};let valid=true;
       for(const [k,label]of Object.entries(fields)){const v=index[label];if(v===undefined||v==='--'||v==='-'||v===''||!Number.isFinite(Number(v))){valid=false;break;}stats[k]=Number(v);}
       if(!valid)continue;
       logs.push({name:row.athlete.displayName,key:nameKey(row.athlete.displayName),athleteId:row.athlete.id,nba:teamCode(group.team?.abbreviation),gameId:event.id,gameDate:event.gameDate,date:event.date,minutes:index.MIN||null,...stats,fpts:Number(fantasyPoints(stats).toFixed(2)),sourceUrl:event.sourceUrl});
     }
   }
 }
 return logs;
}
async function fetchJson(url){
 let last;
 for(let attempt=0;attempt<3;attempt++){
   try{const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'ShohokuFantasy/1.0'}});if(!response.ok)throw new Error(`ESPN HTTP ${response.status}`);return await response.json();}
   catch(error){last=error;if(attempt<2)await sleep((attempt+1)*1200);}
 }
 throw last;
}
async function mapLimit(items,limit,fn){let i=0;const results=Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const j=i++;results[j]=await fn(items[j],j);}}));return results;}
async function readJson(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch{return fallback;}}
async function atomicJson(file,value){const temp=file+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,file);}
export async function refreshPublicFeed(){
 await mkdir(dataDir,{recursive:true});
 const file=resolve(dataDir,'public-feed.json'),old=await readJson(file,{games:[],logs:[],boxCache:{}});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const anchor=new Date(`${today}T12:00:00Z`),dates=[];
 for(let offset=-30;offset<=14;offset++){const d=new Date(anchor);d.setUTCDate(d.getUTCDate()+offset);dates.push(d.toISOString().slice(0,10));}
 const errors=[],refreshedDates=[];
 const boards=await mapLimit(dates,3,async(date)=>{try{const json=await fetchJson(base+'scoreboard?dates='+date.replaceAll('-',''));if(!Array.isArray(json.events))throw new Error('Invalid scoreboard schema');refreshedDates.push(date);return json.events.map(e=>normalizeEvent(e,date)).filter(Boolean);}catch{errors.push({date,message:'Scoreboard unavailable'});return []}});
 const byId=new Map(old.games.filter(g=>dates.includes(g.gameDate)&&!refreshedDates.includes(g.gameDate)).map(g=>[g.id,g]));
 for(const game of boards.flat())byId.set(game.id,game);
 const games=[...byId.values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(!refreshedDates.length)throw new Error('ESPN unavailable. Existing cache kept.');
 const boxCache={...old.boxCache};
 const completed=games.filter(g=>g.completed&&g.gameDate<=today);
 await mapLimit(completed,3,async(game)=>{
   // Re-read the last two NBA days for stat corrections; older finals stay cached.
   const age=(anchor-new Date(game.gameDate+'T12:00:00Z'))/86400000;
   if(boxCache[game.id]?.length&&age>2)return;
   try{const json=await fetchJson(base+'summary?event='+game.id);const logs=normalizeBox(json,game);if(!logs.length)throw new Error('No player stats');boxCache[game.id]=logs;}catch{errors.push({gameId:game.id,message:'Box score unavailable'});}
 });
 const keepIds=new Set(games.map(g=>g.id));for(const id of Object.keys(boxCache))if(!keepIds.has(id))delete boxCache[id];
 const result={source:'ESPN',sourceUrl:'https://www.espn.com/nba/scoreboard',updatedAt:new Date().toISOString(),nbaDate:today,window:{from:dates[0],through:dates.at(-1)},refreshIntervalMinutes:60,refreshedDates:refreshedDates.sort(),partial:errors.length>0,errors,games,logs:completed.flatMap(g=>boxCache[g.id]||[]),boxCache};
 await atomicJson(file,result);
 const status={attemptAt:result.updatedAt,success:true,partial:result.partial,errors:errors.length,games:games.length,playerGameLogs:result.logs.length};
 await atomicJson(resolve(dataDir,'public-refresh-status.json'),status);
 return status;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await refreshPublicFeed()));}
 catch{const status={attemptAt:new Date().toISOString(),success:false,message:'Public feed refresh failed. Existing cache kept.'};await mkdir(dataDir,{recursive:true});await atomicJson(resolve(dataDir,'public-refresh-status.json'),status);console.error(JSON.stringify(status));process.exitCode=1;}
}
