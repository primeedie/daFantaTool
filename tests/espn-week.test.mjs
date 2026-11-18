import {test} from 'node:test';
import assert from 'node:assert/strict';
import {espnWeek} from '../dashboard/model.mjs';

test('ESPN scoring includes both ends of the week and optimizes through Yahoo bench assignments',()=>{
 const centers=Array.from({length:5},(_,i)=>({
  name:`Center ${i}`,nba:'LAL',slot:i===4?'BN':'C',positions:['C'],fpts:10+i
 }));
 const days=['2026-11-16','2026-11-22','2026-11-23'];
 const games=days.map((gameDate,i)=>({id:`game-${i}`,gameDate,home:'LAL',away:'BOS',completed:i!==1,status:i===1?'Scheduled':'Final'}));
 const log=(i,gameId,gameDate,pts)=>({key:`center${i}`,nba:'LAL',gameId,gameDate,date:gameDate+'T20:00:00Z',pts,reb:5,to:2,fpts:999});
 const outsideWeek=log(4,'game-2',days[2],120);
 const sunday=games[1];
 sunday.date='2026-11-23T02:00:00Z';
 const snapshot={nbaDate:'2026-11-17',scoring:{pts:1,reb:1.2,to:-1.5},publicFeed:{
  nbaDate:'2026-11-18',window:{from:'2026-11-01',through:'2026-11-29'},games,
  logs:[log(4,'game-0',days[0],30),outsideWeek]
 }};
 const result=espnWeek(snapshot,[centers]);
 assert.equal(result.start,days[0]);
 assert.equal(result.end,days[1]);
 assert.deepEqual(result.totals,[{actual:33,actualStarts:4,projected:69,projectedStarts:4,missingStarts:0}]);
 assert.equal(result.breakdown[0].find(start=>start.name==='Center 4').points,33);
 sunday.completed=true;
 snapshot.publicFeed.logs.push(log(4,'game-1',days[1],20));
 const afterSunday=espnWeek(snapshot,[centers]);
 assert.equal(afterSunday.totals[0].actual,56);
 assert.equal(afterSunday.totals[0].projected,0);
});

test('a move after tipoff keeps the dropped player and excludes the pickup for that game',()=>{
 const date='2026-11-16';
 const tip='2026-11-17T00:00:00Z';
 const first={name:'Before Move',team_id:'1',nba:'LAL',slot:'BN',positions:['PG'],fpts:10};
 const second={...first,name:'Late Pickup'};
 const game={id:'game',gameDate:date,date:tip,home:'LAL',away:'BOS',completed:true};
 const log=(key,pts)=>({key,nba:'LAL',gameId:game.id,gameDate:date,date:tip,pts});
 const snapshot={
  nbaDate:date,scoring:{pts:1},
  timedRosterMoves:[{teamId:'1',at:'2026-11-17T02:00:00Z',added:second.name,dropped:first}],
  publicFeed:{nbaDate:'2026-11-17',window:{from:date,through:'2026-11-22'},games:[game],logs:[log('beforemove',7.4),log('latepickup',31.2)]}
 };
 const result=espnWeek(snapshot,[[second]]);
 assert.equal(result.totals[0].actual,7.4);
 assert.deepEqual(result.breakdown[0].map(row=>row.name),[first.name]);
});
