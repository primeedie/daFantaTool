export const slots=['PG','SG','G','SF','PF','F','C','C','Util','Util'];
export function eligible(p,slot){
  return slot==='Util'||p.positions.includes(slot)||(slot==='G'&&p.positions.some(x=>x==='PG'||x==='SG'))||(slot==='F'&&p.positions.some(x=>x==='SF'||x==='PF'));
}
export function optimizeLineup(players,{playingTeams=null,includeQ=true,occupiedSlots=0}={}){
  const candidates=players.filter(p=>p.slot!=='IL'&&!['O','NA'].includes(p.status)&&(includeQ||p.status!=='Q')&&(!playingTeams||playingTeams.includes(p.nba))&&Number.isFinite(p.fpts));
  let dp=new Map([[occupiedSlots,{score:0,assignment:Array(10).fill(null)}]]);
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
export function remainingWeek(snapshot,rosters){
  const {nbaDate,capturedDate,captureWindow,publicFeed}=snapshot;
  const captureEnd=/[–-](\d{2}:\d{2}) PHT$/.exec(captureWindow||'')?.[1];
  const cutoff=Date.parse(`${capturedDate}T${captureEnd}:00+08:00`);
  const date=new Date(`${nbaDate}T12:00:00Z`);
  if(!Number.isFinite(cutoff)||!Number.isFinite(+date)||!publicFeed?.games)return null;
  const weekEnd=new Date(date);
  weekEnd.setUTCDate(date.getUTCDate()+(7-date.getUTCDay())%7);
  const end=weekEnd.toISOString().slice(0,10);
  if(!publicFeed.window||publicFeed.window.from>nbaDate||publicFeed.window.through<end)return null;
  const byDay=new Map();
  while(date<=weekEnd){
    const day=date.toISOString().slice(0,10);
    if(publicFeed.refreshedDates&&!publicFeed.refreshedDates.includes(day))return null;
    byDay.set(day,{started:new Set(),remaining:new Set()});
    date.setUTCDate(date.getUTCDate()+1);
  }
  for(const game of publicFeed.games){
    const day=byDay.get(game.gameDate);
    if(!day||/postpon|cancel/i.test(game.status))continue;
    const group=Date.parse(game.date)<=cutoff?day.started:day.remaining;
    group.add(game.home);
    group.add(game.away);
  }
  const totals=rosters.map(players=>{
    let points=0, games=0;
    for(const [day,teams] of byDay){
      if(!teams.remaining.size)continue;
      let occupiedSlots=0;
      if(day===nbaDate){
        for(const player of players){
          if(!teams.started.has(player.nba))continue;
          const index=slots.findIndex((slot,i)=>slot===player.slot&&!(occupiedSlots&(1<<i)));
          if(index>=0)occupiedSlots|=1<<index;
        }
      }
      const lineup=optimizeLineup(players,{playingTeams:[...teams.remaining],occupiedSlots});
      points+=lineup.score;
      games+=lineup.assignment.filter(Boolean).length;
    }
    return {points,games};
  });
  return {end,totals};
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
