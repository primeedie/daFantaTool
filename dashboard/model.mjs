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
export const playerKey=name=>name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\b(jr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');

export function scoreBox(log,scoring){
  let score=0;
  for(const [stat,weight] of Object.entries(scoring)){
    if(!Number.isFinite(log[stat])||!Number.isFinite(weight))return null;
    score+=log[stat]*weight;
  }
  return score;
}

export function playersAtTip(snapshot,players,date,games,teamFor=player=>player.nba){
  const teamId=players[0]?.team_id;
  const update=(snapshot.rosterUpdates||[]).find(entry=>date<entry.effectiveNbaDate&&entry.previous[teamId]);
  const roster=update?.previous[teamId]||players;
  const owned=new Map(roster.map(player=>[player.name,player]));
  const moves=(snapshot.timedRosterMoves||[]).filter(move=>move.teamId===teamId&&(!update?.previousThrough||move.at<=update.previousThrough))
    .sort((a,b)=>b.at.localeCompare(a.at));
  const possible=new Map(owned);
  for(const {dropped} of moves){
    if(dropped&&!possible.has(dropped.name))possible.set(dropped.name,dropped);
  }
  return [...possible.values()].flatMap(player=>{
    const nba=teamFor(player);
    const game=games.get(nba);
    if(!game)return [];
    let onRoster=owned.has(player.name);
    const tip=Date.parse(game.date);
    for(const move of moves){
      if(!(Date.parse(move.at)>tip))break;
      if(move.added===player.name)onRoster=false;
      if(move.dropped?.name===player.name)onRoster=true;
    }
    return onRoster?[{...player,nba,game}]:[];
  });
}

export function espnWeek(snapshot,rosters){
  const {nbaDate,scoring,publicFeed:feed}=snapshot;
  if(!feed?.window||!scoring||!Object.keys(scoring).length)return null;
  const monday=new Date(`${nbaDate}T12:00:00Z`);
  if(!Number.isFinite(+monday))return null;
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const dates=Array.from({length:7},(_,i)=>new Date(+monday+i*86400000).toISOString().slice(0,10));
  if(feed.window.from>dates[0]||feed.window.through<dates[6])return null;
  const gamesByDate=new Map(dates.map(date=>[date,new Map()]));
  for(const game of feed.games){
    const day=gamesByDate.get(game.gameDate);
    if(!day||/postpon|cancel/i.test(game.status))continue;
    day.set(game.home,game);
    day.set(game.away,game);
  }
  const history=snapshot.rosterUpdates||[];
  const priorPlayers=history.flatMap(update=>Object.values(update.previous).flat());
  const droppedPlayers=(snapshot.timedRosterMoves||[]).flatMap(move=>move.dropped?[move.dropped]:[]);
  const keys=new Set([...rosters.flat(),...priorPlayers,...droppedPlayers].map(player=>playerKey(player.name)));
  const logsByPlayer=new Map();
  const completedBoxes=new Set();
  for(const log of feed.logs){
    const points=scoreBox(log,scoring);
    if(points===null)continue;
    completedBoxes.add(`${log.gameId}/${log.nba}`);
    if(!keys.has(log.key))continue;
    if(!logsByPlayer.has(log.key))logsByPlayer.set(log.key,[]);
    logsByPlayer.get(log.key).push({...log,points});
  }
  for(const logs of logsByPlayer.values())logs.sort((a,b)=>b.date.localeCompare(a.date));
  const breakdown=[];
  const totals=rosters.map(players=>{
    const total={actual:0,actualStarts:0,projected:0,projectedStarts:0,missingStarts:0};
    const starts=[];
    breakdown.push(starts);
    for(const [date,games] of gamesByDate){
      const finishedDay=date<feed.nbaDate||([...games.values()].length>0&&[...games.values()].every(game=>game.completed));
      const playerLogs=player=>logsByPlayer.get(playerKey(player.name))||[];
      const slate=playersAtTip(snapshot,players,date,games,player=>playerLogs(player).find(log=>log.gameDate===date)?.nba||player.nba);
      const candidates=slate.flatMap(player=>{
        if(player.slot==='IL')return [];
        if(!finishedDay&&['O','NA'].includes(player.status))return [];
        const logs=playerLogs(player);
        const prior=logs.filter(log=>log.gameDate<date).slice(0,10);
        const average=prior.length?prior.reduce((sum,log)=>sum+log.points,0)/prior.length:player.fpts;
        if(!Number.isFinite(average))return [];
        return [{...player,status:'',fpts:average,logs}];
      });
      const lineup=optimizeLineup(candidates);
      for(const player of lineup.assignment.filter(Boolean)){
        const {game,logs}=player;
        if(!game.completed){
          total.projected+=player.fpts;
          total.projectedStarts++;
        }else if(completedBoxes.has(`${game.id}/${player.nba}`)){
          const box=logs.find(log=>log.gameId===game.id);
          const points=box?.points??0;
          total.actual+=points;
          total.actualStarts++;
          starts.push({date,name:player.name,nba:player.nba,points,box});
        }else total.missingStarts++;
      }
    }
    return total;
  });
  const missingDates=feed.refreshedDates?dates.filter(date=>!feed.refreshedDates.includes(date)):[];
  return {start:dates[0],end:dates[6],totals,breakdown,missingDates,updatedAt:feed.updatedAt};
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
  const matchup={opponent:data.teams.find(t=>t.id===(side?m.b:m.a)),score:side?m.scoreA:m.scoreB,opponentScore:side?m.scoreB:m.scoreA,yahooEstimate:side?m.yahooEstimateA:m.yahooEstimateB,opponentEstimate:side?m.yahooEstimateB:m.yahooEstimateA};
  if(m.scoreCheckpoint){
    const {throughNbaDate,scoreA,scoreB,projectionA,projectionB}=m.scoreCheckpoint;
    matchup.checkpoint={throughNbaDate,scores:side?[scoreA,scoreB]:[scoreB,scoreA],yahooProjection:side?[projectionA,projectionB]:[projectionB,projectionA]};
  }
  return matchup;
}
