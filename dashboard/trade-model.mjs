export const boxFields={pts:'PTS',reb:'REB',oreb:'OREB',dreb:'DREB',ast:'AST',st:'STL',blk:'BLK',to:'TOV'};

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

export function recentPackagePoints(players,weights){
 let total=0;
 for(const player of players){
  const sample=(player.recent||[]).map(box=>tradePoints(box,weights)).filter(points=>points!==null);
  if(sample.length<3)return null;
  total+=sample.reduce((sum,points)=>sum+points,0)/sample.length;
 }
 return total;
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
