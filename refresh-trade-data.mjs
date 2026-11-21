import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {playerKey} from './dashboard/model.mjs';
import {bigBallsRosterExtras} from './dashboard/big-balls.mjs';
import {smallBallsRosterExtras} from './dashboard/small-balls.mjs';

const origin='https://www.rotowire.com';
const rankUrl=origin+'/basketball/article/2026-27-fantasy-basketball-cheat-sheet-points-leagues-printable-excel-142162';
const statsUrl=origin+'/basketball/stats.php';
const linkedRankings=origin+'/basketball/article/updated-2026-27-fantasy-basketball-rankings-top-250-players-140954';
const depthCharts=origin+'/basketball/nba-depth-charts/';
const teamIndex=origin+'/basketball/team/los-angeles-lakers-lal';
const profileFallbacks={krisdunn:'/basketball/player/kris-dunn-3854',jimmybutler:'/basketball/player/jimmy-butler-3231',
 klaythompson:'/basketball/player/klay-thompson-3197',jaredmccain:'/basketball/player/jared-mccain-6266',
 yanickonanniederhauser:'/basketball/player/yanic-konan-niederhauser-6616',
 kasparasjakucionis:'/basketball/player/kasparas-jakucionis-6557',
 yanghansen:'/basketball/player/yang-hansen-6617',jordanpoole:'/basketball/player/jordan-poole-4791'};
const codes={SAN:'SAS',SA:'SAS',NY:'NYK',NO:'NOP',GS:'GSW',PHO:'PHX',UTAH:'UTA',WSH:'WAS'};
const nbaCode=code=>codes[code]||code;
const statFields={pts:'pts',reb:'reb',oreb:'oreb',dreb:'dreb',ast:'ast',st:'stl',blk:'blk',to:'to'};

function plain(value){
 return value.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|apos|quot|nbsp|rsquo));/gi,(match,decimal,hex,entity)=>{
  if(decimal||hex)return String.fromCodePoint(decimal?Number(decimal):parseInt(hex,16));
  return {amp:'&',apos:"'",quot:'"',nbsp:' ',rsquo:'’'}[entity.toLowerCase()];
 }).trim();
}
async function request(url,type='text'){
 const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(`RotoWire HTTP ${response.status}`);
 return response[type]();
}
async function limit(items,concurrency,fn){
 let next=0;
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(next<items.length)await fn(items[next++]);
 }));
}
function profilesFrom(html,profiles){
 for(const [,path,slug,label] of html.matchAll(/href="(?:https:\/\/www\.rotowire\.com)?(\/basketball\/player\/([a-z0-9-]+-\d+))"[^>]*>([^<]*)/gi)){
  profiles.set(playerKey(slug.replace(/-\d+$/,'').replaceAll('-',' ')),path);
  if(label.trim())profiles.set(playerKey(plain(label)),path);
 }
}
function rankRows(html){
 const pattern=/class="rwcs-rank-num">(\d+)<\/span><span class="rwcs-rank-player"><span class="rwcs-pr">[^<]*<\/span>([^<]+)<span class="rwcs-team">\s*[·\s]*([A-Z]{2,4})<\/span><\/span><span class="rwcs-rank-pos[^"]*">([^<]+)<\/span>/g;
 return [...html.matchAll(pattern)].map(([,rank,name,team,position])=>{
  name=plain(name);
  return {id:playerKey(name),name,nba:nbaCode(team),position,rank:Number(rank)};
 });
}
function perGame(data){
 const rows=(data?.basic?.nba?.body||[]).filter(row=>String(row.season).startsWith('2026')&&Number(row.games)>0);
 if(!rows.length)return null;
 const allTeams=rows.find(row=>/^(TOT|\d+TM)$/i.test(row.team)||String(row.team).includes('/'));
 const season=allTeams?[allTeams]:rows;
 const games=season.reduce((sum,row)=>sum+Number(row.games),0);
 const stats={};
 for(const [key,field] of Object.entries(statFields)){
  if(season.every(row=>row[field]!=null&&String(row[field]).trim()&&Number.isFinite(Number(row[field])))){
   stats[key]=season.reduce((sum,row)=>sum+Number(row[field])*Number(row.games),0)/games;
  }
 }
 return Object.keys(stats).length?{games,stats,nba:!allTeams&&rows.length===1?nbaCode(rows[0].team):null}:null;
}

function recentGames(data){
 return (data?.gl2026?.body||[])
  .filter(row=>row.gametype==='REGULAR'&&String(row.playedgame)==='1'&&/^\d{4}-\d{2}-\d{2}/.test(row.gamedate))
  .sort((a,b)=>b.gamedate.localeCompare(a.gamedate))
  .map(row=>({date:row.gamedate.slice(0,10),opponent:nbaCode(row.oppraw),...Object.fromEntries(Object.entries(statFields).flatMap(([key,field])=>{
   const raw=row[field];
   return raw!=null&&String(raw).trim()&&Number.isFinite(Number(raw))?[[key,Number(raw)]]:[];
  }))}));
}

function opponentHistory(data){
 const meetings={};
 const rows=[...(data?.gl2026?.body||[]),...(data?.gl2025?.body||[])]
  .filter(row=>row.gametype==='REGULAR'&&String(row.playedgame)==='1'&&/^\d{4}-\d{2}-\d{2}/.test(row.gamedate))
  .sort((a,b)=>b.gamedate.localeCompare(a.gamedate));
 for(const row of rows){
  const opponent=nbaCode(row.oppraw);
  if(!opponent||meetings[opponent])continue;
  const stats=Object.fromEntries(Object.entries(statFields).flatMap(([key,field])=>{
   const raw=row[field];
   return raw!=null&&String(raw).trim()&&Number.isFinite(Number(raw))?[[key,Number(raw)]]:[];
  }));
  meetings[opponent]={date:row.gamedate.slice(0,10),minutes:row.min||null,stats};
 }
 return meetings;
}

function gamesHistory(data){
 const history={};
 for(const year of [2023,2024,2025]){
  const rows=(data?.basic?.nba?.body||[]).filter(row=>String(row.season).startsWith(String(year))&&Number(row.games)>0);
  const allTeams=rows.find(row=>/^(TOT|\d+TM)$/i.test(row.team)||String(row.team).includes('/'));
  if(rows.length)history[year]=allTeams?Number(allTeams.games):rows.reduce((sum,row)=>sum+Number(row.games),0);
 }
 return history;
}

const root=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const missingOnly=args.includes('--missing-only');
const output=args.find(arg=>arg!=='--missing-only')||resolve(root,'dashboard/trade-data.json');
let previous;
try {
 const saved=await readFile(output,'utf8').catch(()=>readFile(resolve(root,'dashboard/trade-data.json'),'utf8'));
 previous=JSON.parse(saved);
} catch {}
const oldPlayers=new Map((previous?.players||[]).map(player=>[player.id,player]));
const [cheat,withLinks,depth,teams]=await Promise.all([
 request(rankUrl),request(linkedRankings).catch(()=>''),request(depthCharts).catch(()=>''),request(teamIndex).catch(()=>'')
]);
const players=rankRows(cheat);
if(players.length!==200||new Set(players.map(player=>player.id)).size!==players.length)throw new Error('RotoWire draft rank list changed');
const rankedCount=players.length;
const rankedIds=new Set(players.map(player=>player.id));
for(const [name,nba,position] of [...bigBallsRosterExtras,...smallBallsRosterExtras]){
 const id=playerKey(name);
 if(!rankedIds.has(id))players.push({id,name,nba,position,rank:null});
}
const profiles=new Map();
profilesFrom(withLinks,profiles);
profilesFrom(depth,profiles);
profilesFrom(teams,profiles);
const teamPages=[...new Set([...teams.matchAll(/href="(\/basketball\/team\/[a-z0-9-]+)"/g)].map(match=>match[1]))];
if(players.some(player=>!profiles.has(player.id)&&!oldPlayers.get(player.id)?.profile)){
 await limit(teamPages,4,async path=>{try {profilesFrom(await request(origin+path),profiles);} catch {}});
}
let updated=0,retained=0;
await limit(players,5,async player=>{
 const old=oldPlayers.get(player.id);
 if(missingOnly&&old?.stats){Object.assign(player,old);retained++;return;}
 const path=profiles.get(player.id)||old?.profile?.replace(origin,'')||profileFallbacks[player.id];
 if(!path)return;
 player.profile=origin+path;
 const id=/-(\d+)$/.exec(path)?.[1];
 if(!id)return;
 try {
  const url=new URL('/basketball/ajax/player-page-data.php',origin);
  url.search=new URLSearchParams({id,team:player.nba,nba:'true'}).toString();
  const data=await request(url,'json');
  const row=perGame(data);
  player.history=gamesHistory(data);
  player.gameLogs=recentGames(data);
  player.opponentHistory=opponentHistory(data);
  if(row){
   player.nba=row.nba||player.nba;
   player.games=row.games;
   player.stats=row.stats;
   updated++;
   return;
  }
 } catch {}
 if(old?.stats){player.games=old.games;player.stats=old.stats;player.nba=old.nba||player.nba;retained++;}
 if(!player.history&&old?.history)player.history=old.history;
 if(!player.gameLogs&&old?.gameLogs)player.gameLogs=old.gameLogs;
 if(!player.opponentHistory&&old?.opponentHistory)player.opponentHistory=old.opponentHistory;
});
if((missingOnly?updated+retained:updated)<100)throw new Error(`Only ${updated} active-season RotoWire stats rows updated. Keeping the existing dataset.`);
const result={analysisVersion:4,rankUrl,statsUrl,rankDate:'Oct 19, 2026',updatedAt:new Date().toISOString(),players};
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(output+'.tmp',JSON.stringify(result,null,2)+'\n');
await rename(output+'.tmp',output);
console.log(`RotoWire: ${rankedCount} draft ranks and ${players.length-rankedCount} additional roster players, ${updated} updated season averages, ${retained} cached.`);
