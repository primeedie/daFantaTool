import {optimizeLineup,playerKey,slots} from './model.mjs';

export const boxFields={pts:'PTS',reb:'REB',oreb:'OREB',dreb:'DREB',ast:'AST',st:'STL',blk:'BLK',to:'TOV'};
const playerAliases=new Map([
 ['nikolajokic',['joker','thejoker']],['victorwembanyama',['wemby','alien','thealien']],
 ['shaigilgeousalexander',['sga']],['giannisantetokounmpo',['greekfreak','thegreekfreak']],
 ['lukadoncic',['lukamagic']],['anthonyedwards',['ant','antman']],['karlanthonytowns',['kat']],
 ['donovanmitchell',['spida']],['anthonydavis',['ad','brow','thebrow']],['kevindurant',['kd','slimreaper']],
 ['stephencurry',['steph','chef','chefcurry']],['lebronjames',['bron','kingjames']],
 ['jamesharden',['beard','thebeard']],['damianlillard',['dame','dametime']],['joelembiid',['theprocess']],
 ['jimmybutler',['jimmybuckets']],['devinbooker',['dbook']],['traeyoung',['icetrae']]
]);

export function pickerMatch(player,query){
 if(!query)return 1;
 const name=playerKey(player.name);
 const aliases=playerAliases.get(player.id)||[];
 if(name===query||aliases.includes(query))return 2;
 return Number(name.includes(query)||Boolean(player.nba?.toLowerCase().includes(query))||aliases.some(alias=>alias.includes(query)));
}
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
export const lineupWeekCount=5;

const matchupPending=game=>game.home==='TBD'||game.away==='TBD';
function weeklySlates(feed,dates){
 const byDate=new Map(dates.map(date=>[date,[]]));
 for(const game of feed.games||[]){
  const tip=new Date(game.date);
  if(game.nbaCupFinal||!Number.isFinite(+tip)||/postpon|cancel/i.test(game.status))continue;
  byDate.get(easternDay(tip))?.push(game);
 }
 return byDate;
}

export function weeklyPackage(players,feed,weights,dates){
 const byDate=weeklySlates(feed,dates);
 const confirmedDates=new Set(feed.refreshedDates||[]);
 const daily=dates.map(date=>{
  const games=byDate.get(date).filter(game=>!matchupPending(game));
  const playing=players.flatMap(player=>games.filter(game=>player.nba&&(player.nba===game.home||player.nba===game.away)).map(()=>player));
  const points=playing.map(player=>tradePoints(player.stats,weights));
  return {date,games:playing.length,covered:confirmedDates.has(date),points:points.includes(null)?null:points.reduce((sum,value)=>sum+value,0)};
 });
 const covered=daily.every(day=>day.covered);
 const games=daily.reduce((sum,day)=>sum+day.games,0);
 const total=covered&&games&&players.every(player=>player.nba)&&daily.every(day=>day.points!==null)?daily.reduce((sum,day)=>sum+day.points,0):null;
 return {daily,total,games,covered};
}

export function lineupWeek(feed,weights,dates){
 const confirmedDates=new Set(feed.refreshedDates||[]);
 if(!dates.every(date=>confirmedDates.has(date)))return null;
 const slates=[...weeklySlates(feed,dates)].map(([date,games])=>{
  const known=games.filter(game=>!matchupPending(game));
  return {date,gameCount:known.length,teams:new Set(known.flatMap(game=>[game.home,game.away]))};
 });
 const optimized=new Map();
 const playerValues=new Map();
 return (players,returnPlan)=>{
  const missing=[];
  const eligiblePlayers=[];
  for(const player of players){
   if(!playerValues.has(player.id)){
    const positions=feed.positions?.[playerKey(player.name)]||player.positions||player.position?.match(/PG|SG|SF|PF|G|F|C/g)||[];
    const fpts=tradePoints(player.stats,weights);
    playerValues.set(player.id,player.nba&&positions.length&&fpts!==null?{...player,positions,fpts}:null);
   }
   const value=playerValues.get(player.id);
   if(value)eligiblePlayers.push(value);
   else missing.push(player.name);
  }
  const daily=slates.map(({date,gameCount,teams})=>{
   const playing=eligiblePlayers.flatMap(player=>{
    if(!teams.has(player.nba))return [];
    if(returnPlan?.drop===player.id&&date>=returnPlan.from)return [];
    if(returnPlan?.player!==player.id)return [player];
    return date>=returnPlan.from?[{...player,fpts:player.fpts*returnPlan.scale}]:[];
   });
   const key=JSON.stringify(playing.map(player=>[player.id,player.fpts]));
   if(!optimized.has(key)){
    if(optimized.size>=8192)optimized.clear();
    const {score,assignment}=optimizeLineup(playing);
    const starters=assignment.flatMap((player,index)=>player?[{player,slot:slots[index]}]:[]);
    const bench=playing.filter(player=>!assignment.includes(player));
    const open=assignment.flatMap((player,index)=>player?[]:[slots[index]]);
    optimized.set(key,{score,starters,bench,open});
   }
   return {date,gameCount,...optimized.get(key)};
  });
  return {daily,missing,points:daily.reduce((total,day)=>total+day.score,0),benched:daily.reduce((total,day)=>total+day.bench.length,0)};
 };
}

export function lineupHorizon(feed,weights,now=new Date()){
 const today=easternDay(now);
 const dateGroups=Array.from({length:lineupWeekCount},(_,offset)=>easternWeek(offset,now));
 const slates=weeklySlates(feed,dateGroups.flat());
 const todayGames=slates.get(today);
 const locked=todayGames.some(game=>!matchupPending(game)&&(game.completed||Date.parse(game.date)<=+now));
 const refreshed=new Set(feed.refreshedDates||[]);
 const weeks=dateGroups.map(dates=>{
  const remaining=dates.filter(date=>date>today||date===today&&!locked);
  return {dates,remaining,covered:remaining.every(date=>refreshed.has(date)),tbd:remaining.some(date=>slates.get(date).some(matchupPending))};
 });
 const scoredDates=weeks.flatMap(week=>week.covered?week.remaining:[]);
 const project=scoredDates.length?lineupWeek(feed,weights,scoredDates):null;
 return {weeks,project,scope:scoredDates.join(',')};
}

function lineupSwapImpact(before,after,sent,received){
 let outgoingStarts=0,incomingStarts=0,playerDelta=0,bestDay=null;
 const otherStarts=new Map();
 const countOtherStarts=(starters,excluded,change)=>{
  for(const {player} of starters){
   if(player.id===excluded.id)continue;
   const starts=(otherStarts.get(player.id)?.starts??0)+change;
   otherStarts.set(player.id,{player,starts});
  }
 };
 for(const [index,day] of after.daily.entries()){
  const prior=before.daily[index];
  const outgoing=prior.starters.find(({player})=>player.id===sent.id);
  const incoming=day.starters.find(({player})=>player.id===received.id);
  outgoingStarts+=Number(Boolean(outgoing));
  incomingStarts+=Number(Boolean(incoming));
  playerDelta+=(incoming?.player.fpts??0)-(outgoing?.player.fpts??0);
  countOtherStarts(prior.starters,sent,-1);
  countOtherStarts(day.starters,received,1);
  const gain=Math.round((day.score-prior.score)*100)/100;
  if(gain>(bestDay?.gain??0))bestDay={date:day.date,gain,slot:incoming?.slot??null};
 }
 const otherStarterDelta=Math.round((after.points-before.points-playerDelta)*100)/100;
 const direction=Math.sign(otherStarterDelta);
 const starterShift=[...otherStarts.values()].filter(({starts,player})=>starts*player.fpts*direction>0)
  .sort((a,b)=>direction*(b.starts*b.player.fpts-a.starts*a.player.fpts))[0]??null;
 return {outgoingStarts,incomingStarts,otherStarterDelta,bestDay,starterShift};
}

export function rankLineupTargets(project,rosters,outgoing,targets,weights){
 const before=project(rosters.a),opponentBefore=project(rosters.b);
 const scores=new Map([...outgoing,...targets].map(player=>[player.id,tradePoints(player.stats,weights)]));
 const available=outgoing.filter(player=>!before.missing.includes(player.name));
 const ranked=[];
 for(const target of targets){
  if(opponentBefore.missing.includes(target.name))continue;
  let best;
  for(const send of available){
   const balance=tradeBalance(scores.get(send.id),scores.get(target.id));
   if(balance?.level!=='fair')continue;
   const after=project(rosters.a.map(player=>player.id===send.id?target:player));
   const gain=Math.round((after.points-before.points)*100)/100;
   if(gain<=0||best&&gain<best.gain)continue;
   const opponentAfter=project(rosters.b.map(player=>player.id===target.id?send:player));
   const opponentGain=Math.round((opponentAfter.points-opponentBefore.points)*100)/100;
   if(opponentGain<0||best&&gain===best.gain&&opponentGain<=best.opponentGain)continue;
   best={target,send,gain,opponentGain,balance,impact:{
    a:lineupSwapImpact(before,after,send,target),
    b:lineupSwapImpact(opponentBefore,opponentAfter,target,send)
   }};
  }
  if(best)ranked.push(best);
 }
 return ranked.sort((a,b)=>b.gain-a.gain||b.opponentGain-a.opponentGain||a.target.name.localeCompare(b.target.name));
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
export const defaultRoster={regular:13,il:3};
const defaultRosterSide={open:0,ilOut:0,ilIn:0};

export function rosterSpots(outgoing,incoming,settings=defaultRosterSide){
 const change=incoming-settings.ilIn-(outgoing-settings.ilOut);
 return {change,cuts:Math.max(change-settings.open,0),pickups:Math.max(-change,0)};
}

export function rosterAdjustment(baseNet,values,{cuts,pickups}){
 const remaining=Math.max(0,(cuts||pickups)-values.length);
 const net=Number.isFinite(baseNet)&&values.every(Number.isFinite)?
  Number((baseNet+(cuts?-1:1)*values.reduce((total,value)=>total+value,0)).toFixed(2)):null;
 return {net,remaining,breakEven:pickups&&remaining&&net!==null?Math.max(0,-net):null};
}

export function rosterSettings(limits,side,outgoing,incoming){
 const count=(value,fallback,min,max)=>value!==''&&value!=null&&Number.isFinite(Number(value))?
  Math.max(min,Math.min(max,Math.trunc(Number(value)))):fallback;
 const regular=count(limits?.regular,defaultRoster.regular,1,99);
 const il=count(limits?.il,defaultRoster.il,0,99);
 return {regular,il,open:count(side?.open,0,0,regular),ilOut:count(side?.ilOut,0,0,Math.min(il,outgoing)),ilIn:count(side?.ilIn,0,0,Math.min(il,incoming))};
}

export function sharedPlayerRef(player){
 const profileId=/-([0-9]+)$/.exec(player.profile||'')?.[1];
 return profileId?`_${Number(profileId).toString(36)}`:player.id;
}

export function compactTradeHash({scoring,split,names,a,b,roster}){
 const values=(split?splitFields:regularFields).map(key=>scoring[key]??'');
 const code=split?'s'+values.join(','):values.every((value,i)=>value===defaultWeights[i])?'d':values.join(',');
 const sideValues=['a','b'].flatMap(key=>['open','ilOut','ilIn'].map(field=>roster?.[key]?.[field]??0));
 const limits=[roster?.regular??defaultRoster.regular,roster?.il??defaultRoster.il];
 const adjusted=roster?.a?.players?.length||roster?.b?.players?.length||sideValues.some(Boolean)||limits[0]!==defaultRoster.regular||limits[1]!==defaultRoster.il;
 const fields=[adjusted?'#t=3':'#t=2',code,a.join(','),b.join(',')];
 if(adjusted||names.some(Boolean)){
  const text=new TextEncoder().encode(names.some(Boolean)?names.join('\n'):'');
  fields.push(btoa(String.fromCharCode(...text)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));
 }
 if(adjusted)fields.push(roster?.a?.players?.join(',')||'',roster?.b?.players?.join(',')||'',[...limits,...sideValues].join(','));
 return fields.join('~');
}

export const isTradeHash=hash=>hash.startsWith('#trade=')||hash.startsWith('#t=');

export function parseSharedTrade(hash){
 if(!isTradeHash(hash)||hash.length>36000)return null;
 try {
  const compact=hash.startsWith('#t=');
  let values,split,names,a,b,roster;
  const list=value=>value?value.split(','):[];
  if(compact){
   const fields=hash.split('~');
   const [version,code,left,right,encoded='',adjustA,adjustB,rosterCode]=fields;
   if(!(version==='#t=2'&&fields.length>=4&&fields.length<=5||version==='#t=3'&&fields.length===8)||encoded.length>260||!/^[\w-]*$/.test(encoded))return null;
   split=code.startsWith('s');
   const keys=split?splitFields:regularFields;
   const raw=code==='d'?defaultWeights:(split?code.slice(1):code).split(',');
   if(raw.length!==keys.length)return null;
   values=Object.fromEntries(keys.map((key,index)=>[key,raw[index]===''?null:Number(raw[index])]));
   const text=atob(encoded.replaceAll('-','+').replaceAll('_','/'));
   names=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(text,letter=>letter.charCodeAt(0))).split('\n');
   a=list(left);
   b=list(right);
   if(version==='#t=3'){
    if(!/^\d{1,2}(,\d{1,2}){7}$/.test(rosterCode))return null;
    const [regular,il,openA,outA,inA,openB,outB,inB]=rosterCode.split(',').map(Number);
    if(regular<1)return null;
    const limits={regular,il};
    roster={...limits,a:{...rosterSettings(limits,{open:openA,ilOut:outA,ilIn:inA},a.length,b.length),players:list(adjustA)},b:{...rosterSettings(limits,{open:openB,ilOut:outB,ilIn:inB},b.length,a.length),players:list(adjustB)}};
   }
  }else{
   let version;
   [version,values,split,names,a,b]=JSON.parse(decodeURIComponent(hash.slice(7)));
   if(version!==1||typeof split!=='boolean'||!Array.isArray(names)||!Array.isArray(a)||!Array.isArray(b))return null;
  }
  const ids=[...a,...b];
  const validRef=id=>typeof id==='string'&&(/^[a-z0-9]{1,48}$/.test(id)||compact&&/^_[a-z0-9]{1,12}$/.test(id));
  if(!ids.length||ids.length>200||new Set(ids).size!==ids.length||!ids.every(validRef))return null;
  if(roster)for(const [key,outgoing,incoming] of [['a',a,b],['b',b,a]]){
   const {cuts,pickups}=rosterSpots(outgoing.length,incoming.length,roster[key]);
   const refs=roster[key].players;
   if(refs.length>(cuts||pickups)||new Set(refs).size!==refs.length||!refs.every(ref=>validRef(ref)&&!ids.includes(ref)))return null;
  }
  const scoring=Object.fromEntries(Object.keys(boxFields).map(key=>[key,Number.isFinite(values[key])?values[key]:'']));
  if(!scoringWeights(scoring,split))return null;
  return roster?{scoring,split,names,a,b,roster}:{scoring,split,names,a,b};
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

export const suggestionPoolLimit=16;

function suggestionPackages(players,weights){
 const scored=new Map();
 for(const player of players){
  const points=tradePoints(player.stats,weights);
  if(points!==null)scored.set(player.id,{player,points});
 }
 const pool=[...scored.values()].slice(0,suggestionPoolLimit);
 const packages=[];
 function extend(start,group,points){
  if(group.length)packages.push({players:group,points});
  if(group.length===3)return;
  for(let i=start;i<pool.length;i++)extend(i+1,[...group,pool[i].player],points+pool[i].points);
 }
 extend(0,[],0);
 return packages;
}

export function suggestFairTrades(outgoing,targets,weights){
 const source=suggestionPackages(outgoing,weights);
 const wanted=suggestionPackages(targets,weights);
 const matches=[];
 const compare=(left,right)=>left.balance.percentage-right.balance.percentage||left.size-right.size||right.total-left.total;
 for(const a of source)for(const b of wanted){
  const balance=tradeBalance(b.points,a.points);
  if(balance?.level!=='fair'||a.players.some(player=>b.players.some(target=>target.id===player.id)))continue;
  const offer={a,b,balance,size:a.players.length+b.players.length,total:a.points+b.points};
  const index=matches.findIndex(match=>compare(offer,match)<0);
  if(index>=0)matches.splice(index,0,offer);
  else if(matches.length<8)matches.push(offer);
  if(matches.length>8)matches.pop();
 }
 return matches;
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

export function playerInjury(player,records){
 const profileId=/-([0-9]+)$/.exec(player.profile||'')?.[1];
 return records?.[profileId]||records?.[player.id];
}

export function tradeContext(players,injuryRecords,weights){
 const entries=players.map(player=>{
  const injury=playerInjury(player,injuryRecords);
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
