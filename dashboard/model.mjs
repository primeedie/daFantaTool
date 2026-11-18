export const slots=['PG','SG','G','SF','PF','F','C','C','Util','Util'];
export function eligible(p,slot){
  return slot==='Util'||p.positions.includes(slot)||(slot==='G'&&p.positions.some(x=>x==='PG'||x==='SG'))||(slot==='F'&&p.positions.some(x=>x==='SF'||x==='PF'));
}
export function optimizeLineup(players,{playingTeams=null,includeQ=true}={}){
  const candidates=players.filter(p=>p.slot!=='IL'&&!['O','NA'].includes(p.status)&&(includeQ||p.status!=='Q')&&(!playingTeams||playingTeams.includes(p.nba))&&Number.isFinite(p.fpts));
  let dp=new Map([[0,{score:0,assignment:Array(10).fill(null)}]]);
  for(const p of candidates){
    const next=new Map(dp);
    for(const [mask,state] of dp){
      for(let i=0;i<slots.length;i++){
        if(mask&(1<<i)||!eligible(p,slots[i]))continue;
        const key=mask|(1<<i),score=state.score+p.fpts;
        if(!next.has(key)||score>next.get(key).score){const assignment=[...state.assignment];assignment[i]=p;next.set(key,{score,assignment});}
      }
    }
    dp=next;
  }
  return [...dp.values()].sort((a,b)=>b.score-a.score||b.assignment.filter(Boolean).length-a.assignment.filter(Boolean).length)[0];
}
export function streamEstimate({candidate,drop,games,newGames,adds,remaining}){
  if(!Number.isFinite(games)||!Number.isFinite(newGames)||games<0||newGames<0||games>7||newGames>7||!Number.isInteger(games)||!Number.isInteger(newGames))return {error:'Enter whole game counts from 0 to 7.'};
  if(adds>remaining)return {error:`Only ${remaining} adds remain in this snapshot.`};
  if(candidate.availability!=='FA')return {error:'Player is on waivers. Wait for availability before treating this as a free-agent add.'};
  if(['O','NA'].includes(candidate.status))return {error:'Player is unavailable in this snapshot.'};
  const gained=candidate.fpts*newGames,lost=drop.fpts*games;
  return {gained,lost,net:gained-lost};
}
export function snapshotMatchup(data,id){
  const m=data.matchups.find(m=>m.a===id||m.b===id);
  if(!m)return null;
  const side=m.a===id;
  return {opponent:data.teams.find(t=>t.id===(side?m.b:m.a)),score:side?m.scoreA:m.scoreB,opponentScore:side?m.scoreB:m.scoreA,yahooEstimate:side?m.yahooEstimateA:m.yahooEstimateB,opponentEstimate:side?m.yahooEstimateB:m.yahooEstimateA};
}
