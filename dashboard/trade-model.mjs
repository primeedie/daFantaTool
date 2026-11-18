export const boxFields={pts:'PTS',reb:'REB',oreb:'OREB',dreb:'DREB',ast:'AST',st:'STL',blk:'BLK',to:'TOV'};
const easternDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function easternDay(date){
 const {year,month,day}=Object.fromEntries(easternDate.formatToParts(date).map(part=>[part.type,part.value]));
 return `${year}-${month}-${day}`;
}

export function easternWeek(offset=0,now=new Date()){
 const date=new Date(`${easternDay(now)}T12:00:00Z`);
 date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7)+offset*7);
 return Array.from({length:7},(_,day)=>new Date(+date+day*86400000).toISOString().slice(0,10));
}

export function weeklyPackage(players,feed,weights,dates){
 const byDate=new Map(dates.map(date=>[date,[]]));
 const confirmedDates=new Set(feed.refreshedDates||[]);
 for(const game of feed.games||[]){
  const tip=new Date(game.date);
  if(!Number.isFinite(+tip)||/postpon|cancel/i.test(game.status))continue;
  byDate.get(easternDay(tip))?.push(game);
 }
 const daily=dates.map(date=>{
  const games=byDate.get(date);
  const playing=players.flatMap(player=>games.filter(game=>player.nba&&(player.nba===game.home||player.nba===game.away)).map(()=>player));
  const points=playing.map(player=>tradePoints(player.stats,weights));
  return {date,games:playing.length,covered:confirmedDates.has(date),points:points.includes(null)?null:points.reduce((sum,value)=>sum+value,0)};
 });
 const covered=daily.every(day=>day.covered);
 const games=daily.reduce((sum,day)=>sum+day.games,0);
 const total=covered&&games&&players.every(player=>player.nba)&&daily.every(day=>day.points!==null)?daily.reduce((sum,day)=>sum+day.points,0):null;
 return {daily,total,games,covered};
}

export function historicalAvailability(player,record,currentSeason,weights){
 if(!record||!Number.isInteger(currentSeason))return null;
 const seasons=Object.keys(player.history||{}).filter(year=>+year>=currentSeason-3&&+year<currentSeason);
 const played=seasons.reduce((sum,year)=>sum+player.history[year],0);
 const missed=seasons.reduce((sum,year)=>sum+(record.seasons?.[year]?.injury??0),0);
 const games=played+missed;
 const points=tradePoints(player.stats,weights);
 const rate=games>=50?missed/games:null;
 return {played,missed,games,rate,adjusted:points!==null&&rate!==null?points*(1-rate):null};
}

const regularFields=['pts','reb','ast','st','blk','to'];
const splitFields=['pts','oreb','dreb','ast','st','blk','to','reb'];
const defaultWeights=[1,1.2,1.5,3,3,-1.5];

export function sharedPlayerRef(player){
 const profileId=/-([0-9]+)$/.exec(player.profile||'')?.[1];
 return profileId?`_${Number(profileId).toString(36)}`:player.id;
}

export function compactTradeHash({scoring,split,names,a,b}){
 const values=(split?splitFields:regularFields).map(key=>scoring[key]??'');
 const code=split?'s'+values.join(','):values.every((value,i)=>value===defaultWeights[i])?'d':values.join(',');
 const fields=['#t=2',code,a.join(','),b.join(',')];
 if(names.some(Boolean)){
  const text=new TextEncoder().encode(names.join('\n'));
  fields.push(btoa(String.fromCharCode(...text)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));
 }
 return fields.join('~');
}

export const isTradeHash=hash=>hash.startsWith('#trade=')||hash.startsWith('#t=');

export function parseSharedTrade(hash){
 if(!isTradeHash(hash)||hash.length>36000)return null;
 try {
  const compact=hash.startsWith('#t=');
  let values,split,names,a,b;
  if(compact){
   const fields=hash.split('~');
   const [version,code,left,right,encoded='']=fields;
   if(version!=='#t=2'||fields.length<4||fields.length>5||encoded.length>260||!/^[\w-]*$/.test(encoded))return null;
   split=code.startsWith('s');
   const keys=split?splitFields:regularFields;
   const raw=code==='d'?defaultWeights:(split?code.slice(1):code).split(',');
   if(raw.length!==keys.length)return null;
   values=Object.fromEntries(keys.map((key,index)=>[key,raw[index]===''?null:Number(raw[index])]));
   const text=atob(encoded.replaceAll('-','+').replaceAll('_','/'));
   names=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(text,letter=>letter.charCodeAt(0))).split('\n');
   a=left?left.split(','):[];
   b=right?right.split(','):[];
  }else{
   let version;
   [version,values,split,names,a,b]=JSON.parse(decodeURIComponent(hash.slice(7)));
   if(version!==1||typeof split!=='boolean'||!Array.isArray(names)||!Array.isArray(a)||!Array.isArray(b))return null;
  }
  const ids=[...a,...b];
  if(!ids.length||ids.length>200||new Set(ids).size!==ids.length||!ids.every(id=>typeof id==='string'&&(/^[a-z0-9]{1,48}$/.test(id)||compact&&/^_[a-z0-9]{1,12}$/.test(id))))return null;
  const scoring=Object.fromEntries(Object.keys(boxFields).map(key=>[key,Number.isFinite(values[key])?values[key]:'']));
  if(!scoringWeights(scoring,split))return null;
  return {scoring,split,names,a,b};
 } catch {return null;}
}

export function scoringWeights(values,split){
 const rebound=split?['oreb','dreb']:['reb'];
 const weights={};
 for(const stat of ['pts',...rebound,'ast','st','blk','to']){
  const raw=values[stat];
  const number=raw==null||String(raw).trim()===''?NaN:Number(raw);
  if(!Number.isFinite(number))return null;
  weights[stat]=stat==='to'?-Math.abs(number):number;
 }
 return weights;
}

export function tradePoints(stats,weights){
 if(!stats)return null;
 let total=0;
 for(const [stat,weight] of Object.entries(weights)){
  if(weight===0)continue;
  if(!Number.isFinite(stats[stat]))return null;
  total+=stats[stat]*weight;
 }
 return Number.isFinite(total)?total:null;
}

export function nextOpponents(player,feed,weights,now=Date.now()){
 if(!player.nba)return [];
 return (feed?.games||[]).filter(game=>!game.completed&&Date.parse(game.date)>now&&
  !/postpon|cancel/i.test(game.status)&&(game.home===player.nba||game.away===player.nba))
  .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,5).map(game=>{
   const home=game.home===player.nba;
   const opponent=home?game.away:game.home;
   const meeting=player.opponentHistory?.[opponent];
   return {date:game.date,home,opponent,defense:feed.defense?.[opponent],meeting,points:tradePoints(meeting?.stats,weights)};
  });
}

export function seasonRanks(players,weights){
 const scored=players.flatMap(player=>{
  if(!(player.games>0))return [];
  const points=tradePoints(player.stats,weights);
  return points===null?[]:[{id:player.id,points:Number(points.toFixed(2))}];
 }).sort((a,b)=>b.points-a.points);
 const ranks=new Map();
 let priorPoints,rank;
 for(const [index,player] of scored.entries()){
  if(player.points!==priorPoints)rank=index+1;
  ranks.set(player.id,rank);
  priorPoints=player.points;
 }
 return ranks;
}

export function tradeBalance(sideA,sideB){
 if(!Number.isFinite(sideA)||!Number.isFinite(sideB))return null;
 const gap=Number((sideA-sideB).toFixed(2));
 const magnitude=Math.max(Math.abs(sideA),Math.abs(sideB));
 const percentage=magnitude?100*Math.abs(gap)/magnitude:0;
 const level=percentage<=10?'fair':percentage<=20?'edge':'lopsided';
 return {
  gap:Math.abs(gap),
  percentage,
  level,
  leader:gap>0?'A':gap<0?'B':null,
  position:50-0.5*Math.sign(gap)*Math.min(100,percentage)
 };
}

export function managerChanges(outgoingA,outgoingB){
 const net=Number.isFinite(outgoingA)&&Number.isFinite(outgoingB)?Number((outgoingB-outgoingA).toFixed(2)):null;
 return {
  a:{outgoing:outgoingA,incoming:outgoingB,net},
  b:{outgoing:outgoingB,incoming:outgoingA,net:net===null?null:-net}
 };
}

export function packageForm(players,weights,window){
 if(!players.length)return null;
 let total=0;
 let shortest=window;
 const averages=[];
 for(const player of players){
  const games=(player.gameLogs||player.recent||[]).slice(0,window).filter(box=>tradePoints(box,weights)!==null);
  if(!games.length)return null;
  shortest=Math.min(shortest,games.length);
  const stats=Object.fromEntries(Object.keys(weights).map(stat=>[stat,games.reduce((sum,box)=>sum+(box[stat]??0),0)/games.length]));
  averages.push({stats});
  total+=tradePoints(stats,weights);
 }
 return {points:total,shortest,averages};
}

export function percentile(sorted,fraction){
 const index=(sorted.length-1)*fraction;
 const lower=Math.floor(index);
 return sorted[lower]+(sorted[Math.ceil(index)]-sorted[lower])*(index-lower);
}

export function packageScenarios(players,weights){
 if(!players.length)return null;
 let floor=0,ceiling=0;
 for(const player of players){
  const scores=(player.gameLogs||player.recent||[]).map(box=>tradePoints(box,weights)).filter(points=>points!==null).sort((a,b)=>a-b);
  if(scores.length<5)return null;
  floor+=percentile(scores,.25);
  ceiling+=percentile(scores,.75);
 }
 return {floor,ceiling};
}

export function compareGamesPlayed(playerA,playerB){
 const years=Object.keys(playerA.history||{}).filter(year=>Number.isFinite(playerA.history[year])&&Number.isFinite(playerB.history?.[year])).sort();
 if(!years.length)return null;
 const gameTotals=years.map(year=>({year,a:playerA.history[year],b:playerB.history[year]}));
 return {gameTotals,avgA:gameTotals.reduce((sum,season)=>sum+season.a,0)/years.length,avgB:gameTotals.reduce((sum,season)=>sum+season.b,0)/years.length};
}

export function statSwings(outgoing,incoming,weights){
 const totalFor=(players,key)=>players.every(player=>Number.isFinite(player.stats?.[key]))?
  players.reduce((sum,player)=>sum+player.stats[key],0):null;
 return Object.entries(weights).flatMap(([stat,weight])=>{
  if(!weight)return [];
  const before=totalFor(outgoing,stat),after=totalFor(incoming,stat);
  return before===null||after===null?[]:[{stat,points:Number(((after-before)*weight).toFixed(2))}];
 }).filter(change=>change.points!==0).sort((a,b)=>Math.abs(b.points)-Math.abs(a.points));
}

export function tradeContext(players,injuryRecords,weights){
 const entries=players.map(player=>{
  const profileId=/-([0-9]+)$/.exec(player.profile||'')?.[1];
  const injury=injuryRecords?.[profileId]||injuryRecords?.[player.id];
  const status=injury?.status;
  const atRisk=!!status&&/\bout\b|doubtful|questionable|day.to.day/i.test(status);
  const smallSample=!(player.games>=5);
  return {player,injury,atRisk,smallSample,points:tradePoints(player.stats,weights)};
 });
 const flagged=entries.filter(entry=>entry.atRisk);
 return {
  entries:entries.filter(entry=>entry.injury||entry.smallSample),
  flagged:flagged.length,
  flaggedPoints:flagged.every(entry=>entry.points!==null)?flagged.reduce((sum,entry)=>sum+entry.points,0):null
 };
}
