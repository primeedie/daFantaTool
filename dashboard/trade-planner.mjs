import {tradeBalance,tradePoints} from './trade-model.mjs?v=league-trades';

export function rankStreamers(project,players,pool,drop){
 const before=project(players);
 const kept=players.filter(player=>player.id!==drop);
 return pool.flatMap(player=>{
  const after=project([...kept,player]);
  if(after.missing.includes(player.name))return [];
  const gain=after.points-before.points;
  const starts=after.daily.flatMap(day=>day.starters.some(start=>start.player.id===player.id)?[day.date]:[]);
  return gain>0.005?[{player,gain,starts,points:after.points}]:[];
 }).sort((a,b)=>b.gain-a.gain||a.player.name.localeCompare(b.player.name));
}

export function tradedRoster(teams,offer,key,adjustments=[],autoCutScore){
 const side=teams[key],other=key==='a'?'b':'a',opponent=teams[other];
 const sent=new Set(offer[key].map(player=>player.id));
 const own=new Set([...side.active,...side.injured].map(player=>player.id));
 const opposing=new Set([...opponent.active,...opponent.injured].map(player=>player.id));
 if(offer[key].some(player=>!own.has(player.id))||offer[other].some(player=>!opposing.has(player.id)||own.has(player.id)))return null;
 const opposingIL=new Set(opponent.injured.map(player=>player.id));
 const injured=[...side.injured.filter(player=>!sent.has(player.id)),...offer[other].filter(player=>opposingIL.has(player.id))];
 if(injured.length>side.il)return null;
 const players=[...side.active.filter(player=>!sent.has(player.id)),...offer[other].filter(player=>!opposingIL.has(player.id))];
 const cuts=adjustments.filter(player=>players.some(member=>member.id===player.id));
 const pickups=adjustments.filter(player=>!cuts.includes(player));
 if(autoCutScore){
  const eligible=side.active.filter(player=>!sent.has(player.id)).sort((a,b)=>(autoCutScore(a)??Infinity)-(autoCutScore(b)??Infinity));
  cuts.push(...eligible.slice(0,Math.max(0,players.length-side.regular)));
 }
 const cutIds=new Set(cuts.map(player=>player.id));
 const active=[...players.filter(player=>!cutIds.has(player.id)),...pickups];
 return active.length<=side.regular&&new Set([...active,...injured].map(player=>player.id)).size===active.length+injured.length?{active,injured,cuts}:null;
}

export function counteroffers(project,teams,offer,weights){
 const keys=['a','b'];
 const before=Object.fromEntries(keys.map(key=>[key,project(teams[key].active).points]));
 const values=player=>tradePoints(player.stats,weights);
 const packageValue=players=>{
  const scores=players.map(values);
  return scores.includes(null)?null:scores.reduce((sum,score)=>sum+score,0);
 };
 const baseline=tradeBalance(packageValue(offer.a),packageValue(offer.b));
 const results=[];
 for(const key of keys){
  const ids=new Set(offer[key].map(player=>player.id));
  const available=teams[key].active.filter(player=>!ids.has(player.id)&&values(player)!==null);
  const added=available.map(player=>[...offer[key],player]);
  const removed=offer[key].map((_,index)=>offer[key].filter((_,i)=>i!==index));
  const replaced=available.flatMap(player=>offer[key].map((_,index)=>offer[key].map((pick,i)=>i===index?player:pick)));
  for(const players of [...added,...removed,...replaced]){
   if(!players.length||players.length>2||offer[key==='a'?'b':'a'].length>2)continue;
   const proposal={...offer,[key]:players};
   const balance=tradeBalance(packageValue(proposal.a),packageValue(proposal.b));
   if(balance?.level!=='fair'||baseline&&balance.percentage>=baseline.percentage)continue;
   const rosters=Object.fromEntries(keys.map(side=>[side,tradedRoster(teams,proposal,side,[],values)]));
   if(keys.some(side=>!rosters[side]))continue;
   const gains=Object.fromEntries(keys.map(side=>[side,project(rosters[side].active).points-before[side]]));
   results.push({proposal,balance,gains,rosters});
  }
 }
 return results.sort((a,b)=>a.balance.percentage-b.balance.percentage||Math.min(b.gains.a,b.gains.b)-Math.min(a.gains.a,a.gains.b));
}
