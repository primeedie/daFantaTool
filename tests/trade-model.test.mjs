import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringWeights,tradePoints,seasonRanks,tradeBalance} from '../dashboard/trade-model.mjs';

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
