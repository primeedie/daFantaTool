import {test} from 'node:test';
import assert from 'node:assert/strict';
import {espnWeek} from '../dashboard/model.mjs';

test('ESPN scoring includes both ends of the week and optimizes through Yahoo bench assignments',()=>{
 const centers=Array.from({length:5},(_,i)=>({
  name:`Center ${i}`,nba:'LAL',slot:i===4?'BN':'C',positions:['C'],fpts:10+i
 }));
 const days=['2026-11-16','2026-11-22','2026-11-23'];
 const games=days.map((gameDate,i)=>({id:`game-${i}`,gameDate,home:'LAL',away:'BOS',completed:i!==1,status:i===1?'Scheduled':'Final'}));
 const log=(i,gameId,gameDate,pts)=>({key:`center${i}`,nba:'LAL',gameId,gameDate,date:gameDate+'T20:00:00Z',pts,reb:5,to:2});
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
 const checkpoint={scores:[404.3],throughNbaDate:days[0]};
 const anchored=espnWeek(snapshot,[centers],checkpoint);
 assert.deepEqual(anchored.totals,[{actual:404.3,actualStarts:0,projected:69,projectedStarts:4,missingStarts:0}]);
 sunday.completed=true;
 snapshot.publicFeed.logs.push(log(4,'game-1',days[1],20));
 const afterSunday=espnWeek(snapshot,[centers],checkpoint);
 assert.equal(afterSunday.totals[0].actual,427.3);
 assert.equal(afterSunday.totals[0].projected,0);
});
