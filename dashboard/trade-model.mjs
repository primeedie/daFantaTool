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
