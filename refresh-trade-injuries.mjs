import {mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {playerKey} from './dashboard/model.mjs';

const origin='https://www.rotowire.com';
const lineupsUrl=origin+'/basketball/nba-lineups.php';
const reportUrl=origin+'/basketball/injury-report.php';
const newsUrl=origin+'/basketball/news.php?view=injuries';
const statuses={Out:'Out',Ques:'Questionable',Doubt:'Doubtful',Prob:'Probable',OFS:'Out for season'};
const isoDate=value=>{
 const date=new Date(value+' UTC');
 return Number.isFinite(+date)?date.toISOString().slice(0,10):null;
};
const profileId=path=>/-(\d+)$/.exec(path)?.[1];
const plain=value=>value.replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
async function request(url,format='text'){
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`RotoWire HTTP ${response.status}`);
 return response[format]();
}
const requests=[
 request(lineupsUrl),
 request(lineupsUrl+'?date=tomorrow'),
 request(origin+'/basketball/tables/injury-report.php?team=ALL&pos=ALL','json'),
 request(newsUrl)
];
const [today,tomorrow,report,news]=await Promise.all(requests.map(promise=>promise.catch(()=>null)));
const players={};
function record(path,name){
 const id=profileId(path)||playerKey(plain(name));
 return players[id]??={};
}
let slates=0;
for(const [html,source] of [[today,lineupsUrl],[tomorrow,lineupsUrl+'?date=tomorrow']]){
 const date=isoDate(html?.match(/class="page-title__secondary">Starting lineups for ([^<]+)/)?.[1]||'');
 if(!date)continue;
 slates++;
 for(const match of html.matchAll(/<li\s+class="lineup__player[^"]*has-injury-status[^"]*"[^>]*>([\s\S]*?)<\/li>/g)){
  const item=match[1];
  const player=item.match(/<a title="([^"]+)" href="(\/basketball\/player\/[a-z0-9-]+)">/);
  const status=statuses[item.match(/class="lineup__inj">([^<]+)</)?.[1]?.trim()];
  if(!player||!status)continue;
  const entry=record(player[2],player[1]);
  entry.status??=status;
  entry.gameDate??=date;
  entry.statusUrl??=source;
 }
}
if(Array.isArray(report)){
 for(const row of report){
  if(typeof row.player!=='string'||!row.status)continue;
  const entry=record(row.URL,row.player);
  entry.status??=row.status;
  entry.statusUrl??=reportUrl;
  if(row.injury)entry.injury=plain(row.injury);
 }
}
if(news){
 for(const item of news.split(/<div class="news-update(?: [^"]*)?">/).slice(1)){
  const player=item.match(/class="news-update__player-link" href="(\/basketball\/player\/[a-z0-9-]+)">([^<]+)/);
  const note=item.match(/class="news-update__headline" href="(\/basketball\/headlines\/[a-z0-9-]+)">/);
  const area=item.match(/class="news-update__inj">([^<]+)/);
  const date=isoDate(item.match(/class="news-update__timestamp">([^<]+)/)?.[1]||'');
  if(!player||!note||!area||!date)continue;
  const entry=record(player[1],player[2]);
  if(!entry.noteDate||date>entry.noteDate){
   entry.noteDate=date;
   entry.noteArea=plain(area[1]);
   entry.noteUrl=origin+note[1];
  }
 }
}
if(!slates&&!Object.keys(players).length)throw new Error('RotoWire injury data unavailable. Keeping existing report.');
const root=dirname(fileURLToPath(import.meta.url));
const file=resolve(process.argv[2]||resolve(root,'dashboard/trade-injuries.json'));
await mkdir(dirname(file),{recursive:true});
await writeFile(file+'.tmp',JSON.stringify({updatedAt:new Date().toISOString(),lineupsUrl,reportUrl,players},null,2)+'\n');
await rename(file+'.tmp',file);
console.log(`RotoWire: ${Object.keys(players).length} injury records across ${slates} lineup slates and injury reports.`);
