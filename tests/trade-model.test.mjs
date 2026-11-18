import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringWeights,tradePoints} from '../dashboard/trade-model.mjs';

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
