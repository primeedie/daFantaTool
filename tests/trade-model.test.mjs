import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,recentPackagePoints,compareGamesPlayed,statSwings,packageScenarios} from '../dashboard/trade-model.mjs';

const base={pts:'1',reb:'1.2',ast:'1.5',st:'3',blk:'3',to:'1.5'};
const box={pts:20,reb:10,oreb:3,dreb:7,ast:5,st:1,blk:1,to:4};
test('turnover input has the same deduction for either sign',()=>{
 assert.equal(tradePoints(box,scoringWeights(base,false)),39.5);
 assert.deepEqual(scoringWeights(base,false),scoringWeights({...base,to:'-1.5'},false));
});
test('split rebounds use both inputs and never double count total rebounds',()=>{
 const weights=scoringWeights({...base,reb:'100',oreb:'2',dreb:'1'},true);
 assert.equal(tradePoints(box,weights),40.5);
 assert.equal(tradePoints({...box,oreb:undefined},weights),null);
 assert.equal(scoringWeights({...base,oreb:'',dreb:'1'},true),null);
});

test('season ranks follow scored averages rather than draft order',()=>{
 const players=[
  {id:'draft-first',rank:1,games:12,stats:{pts:20,reb:12}},
  {id:'better-scorer',rank:8,games:12,stats:{pts:28,reb:5}},
  {id:'tied',rank:10,games:4,stats:{pts:28,reb:5}},
  {id:'missing',rank:2,games:12,stats:null},
  {id:'unplayed',rank:3,games:0,stats:{pts:30,reb:20}}
 ];
 assert.deepEqual([...seasonRanks(players,{pts:1})],[['better-scorer',1],['tied',1],['draft-first',3]]);
 assert.equal(seasonRanks(players,{reb:2}).get('draft-first'),1);
});

test('trade balance is symmetric, includes the fair threshold and rejects missing scores',()=>{
 assert.deepEqual(tradeBalance(100,90),{gap:10,percentage:10,level:'fair',leader:'A',position:45});
 assert.equal(tradeBalance(85,100).position,57.5);
 assert.equal(tradeBalance(85,100).level,'edge');
 assert.equal(tradeBalance(100,65).level,'lopsided');
 assert.equal(tradeBalance(0,0).leader,null);
 assert.equal(tradeBalance(-3,3).position,100);
 assert.equal(tradeBalance(null,40),null);
});

test('risk context counts uncertain availability and keeps dated injury notes separate',()=>{
 const players=[
  {id:'out',profile:'https://www.rotowire.com/basketball/player/out-1',games:10,stats:{pts:25}},
  {id:'questionable',games:3,stats:{pts:10}},
  {id:'probable',games:8,stats:{pts:30}},
  {id:'old-note',games:12,stats:{pts:40}}
 ];
 const records={'1':{status:'Out'},questionable:{status:'Questionable'},probable:{status:'Probable'},'old-note':{noteDate:'2026-11-10'}};
 const context=tradeContext(players,records,{pts:1});
 assert.equal(context.flagged,2);
 assert.equal(context.flaggedPoints,35);
 assert.equal(context.entries.find(entry=>entry.player.id==='questionable').smallSample,true);
 assert.equal(context.entries.find(entry=>entry.player.id==='old-note').atRisk,false);
});

test('manager net and stat swings are based on who receives the players',()=>{
 assert.deepEqual(managerChanges(20,35),{a:{outgoing:20,incoming:35,net:15},b:{outgoing:35,incoming:20,net:-15}});
 assert.equal(managerChanges(null,35).b.net,null);
 const before=[{stats:{pts:20,reb:10}}],after=[{stats:{pts:26,reb:5}}];
 const weights={pts:1,reb:2};
 assert.deepEqual(statSwings(before,after,weights),[{stat:'reb',points:-10},{stat:'pts',points:6}]);
 assert.deepEqual(statSwings(after,before,weights).map(row=>row.points),[10,-6]);
});

test('availability compares shared seasons and recent FP requires three valid games',()=>{
 const a={history:{2023:38,2024:41,2025:59},recent:[{pts:6},{pts:10},{pts:14}]};
 const b={history:{2024:70,2025:75},recent:[{pts:10},{pts:20}]};
 assert.deepEqual(compareGamesPlayed(a,b),{gameTotals:[{year:'2024',a:41,b:70},{year:'2025',a:59,b:75}],avgA:50,avgB:72.5});
 assert.equal(recentPackagePoints([a],{pts:2}),20);
 assert.equal(recentPackagePoints([a,b],{pts:2}),null);
});

test('trade floor and ceiling add individual quartiles and require five games per player',()=>{
 const p={gameLogs:[10,0,8,2,4,6].map(pts=>({pts}))};
 const q={gameLogs:[10,20,30,40,50].map(pts=>({pts}))};
 assert.deepEqual(packageScenarios([p,q],{pts:1}),{floor:22.5,ceiling:47.5});
 assert.equal(packageScenarios([q,{gameLogs:q.gameLogs.slice(0,4)}],{pts:1}),null);
});
