import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {playerKey} from './dashboard/model.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const source='https://hoopsmatic.com/injury-history/player/';
const sourceSlugs={
 treymurphy:'trey-murphy-iii',michaelporter:'michael-porter-jr',jaimejaquez:'jaime-jaquez-jr',
 kevinporter:'kevin-porter-jr',wendellcarter:'wendell-carter-jr',kellyoubre:'kelly-oubre-jr',scottypippen:'scotty-pippen-jr'
};
const nonInjury=/^(?:illness|sick|rest|personal|suspension|conditioning|health and safety|not with team|coach|inactive|g league|other|no reason)\b/i;
const text=value=>value.replace(/<[^>]*>/g,'').replace(/&#x27;|&#39;|&apos;/g,"'").replace(/&amp;/g,'&').trim();
const seasonOf=date=>String(Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0));
const areas=[['Achilles',/achilles/i],['Ankle',/ankle/i],['Knee',/knee|patell/i],['Foot',/foot|toe/i],['Back',/back|lumbar/i],['Calf',/calf/i],['Hamstring',/hamstring/i],['Hip / groin',/hip|groin|adductor/i],['Hand / wrist',/hand|wrist|thumb|finger/i],['Shoulder',/shoulder/i],['Head / face',/head|face|concussion/i]];

export function injuryHistory(html,name,currentSeason){
 const heading=text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 if(!/ injury history$/i.test(heading)||playerKey(heading.replace(/ injury history$/i,''))!==playerKey(name))return null;
 const audit=html.split('<h2>Games behind the totals</h2>')[1]?.split('</section>')[0];
 if(!audit){
  return /has missed 0 games to injury/i.test(html)?{seasons:{},areas:[],recent:[]}:null;
 }
 const tables=[...audit.matchAll(/<details class="aud"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)];
 if(!tables.length)return null;
 const seasons={},areaTotals=new Map(),dates=new Set(),recent=[];
 for(const [,table] of tables)for(const [,row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
  const [date,gameId,,phase,reason,counted]=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match=>text(match[1]));
  if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!gameId||phase!=='regular'||counted!=='yes'||!reason)continue;
  const season=seasonOf(date);
  if(+season<currentSeason-3||+season>currentSeason||dates.has(gameId))continue;
  dates.add(gameId);
  const rowTotals=seasons[season]??={injury:0,other:0};
  if(nonInjury.test(reason)){rowTotals.other++;continue;}
  rowTotals.injury++;
  const area=areas.find(([,pattern])=>pattern.test(reason))?.[0]||'Other';
  const total=areaTotals.get(area)??{area,games:0,seasons:new Set()};
  total.games++;
  total.seasons.add(season);
  areaTotals.set(area,total);
  recent.push({date,reason:reason.slice(0,90)});
 }
 const lastReasons=new Set();
 const latest=recent.sort((a,b)=>b.date.localeCompare(a.date)).filter(({reason})=>{
  const key=reason.toLowerCase();
  if(lastReasons.has(key))return false;
  lastReasons.add(key);
  return true;
 }).slice(0,4);
 return {seasons,areas:[...areaTotals.values()].sort((a,b)=>b.games-a.games).map(row=>({...row,seasons:row.seasons.size})),recent:latest};
}

async function refresh(){
 const output=resolve(process.argv[2]||resolve(root,'dashboard/trade-injury-history.json'));
 const seed=resolve(root,'dashboard/trade-injury-history.json');
 const {players:ranked}=JSON.parse(await readFile(resolve(root,'dashboard/trade-data.json'),'utf8'));
 const previous=JSON.parse(await readFile(output,'utf8').catch(()=>readFile(seed,'utf8')).catch(()=>'{"players":{}}'));
 const asOf=new Date().toISOString();
 const currentSeason=Number(seasonOf(asOf));
 const players={};
 let next=0,updated=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(next<ranked.length){
   const player=ranked[next++];
   const slug=sourceSlugs[player.id]||/\/([a-z0-9-]+)-\d+$/.exec(player.profile||'')?.[1];
   if(!slug)continue;
   const url=source+slug+'/';
   try {
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
    const record=response.ok&&injuryHistory(await response.text(),player.name,currentSeason);
    if(record){players[player.id]={...record,url,asOf};updated++;continue;}
   } catch {}
   if(previous.players[player.id])players[player.id]=previous.players[player.id];
  }
 }));
 if(updated<50)throw new Error(`Only ${updated} injury histories refreshed. Keeping existing records.`);
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output+'.tmp',JSON.stringify({asOf,currentSeason,players},null,2)+'\n');
 await rename(output+'.tmp',output);
 console.log(`${updated} injury histories refreshed, ${Object.keys(players).length} available.`);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await refresh();
