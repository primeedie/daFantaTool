import test from 'node:test';
import assert from 'node:assert/strict';
import {eligible,optimizeLineup,slots,streamEstimate,snapshotMatchup} from '../dashboard/model.mjs';
const player=(name,positions,fpts,extra={})=>({name,positions,fpts,nba:'NYK',slot:'BN',status:'',...extra});
test('position rules distinguish guards, forwards and utility',()=>{
 assert.equal(eligible(player('x',['SG'],1),'G'),true);
 assert.equal(eligible(player('x',['SG'],1),'F'),false);
 assert.equal(eligible(player('x',['C'],1),'Util'),true);
});
test('optimizer respects position capacity and does not reuse a player',()=>{
 const ps=Array.from({length:6},(_,i)=>player(`PG${i}`,['PG'],i+1));
 const plan=optimizeLineup(ps);
 assert.equal(plan.score,18);
 assert.equal(plan.assignment.filter(Boolean).length,4);
 assert.equal(new Set(plan.assignment.filter(Boolean).map(p=>p.name)).size,4);
 for(let i=0;i<10;i++)if(plan.assignment[i])assert(eligible(plan.assignment[i],slots[i]));
});
test('optimizer handles flexible positions without stranding a specialist',()=>{
 const ps=[player('flex',['PG','SF'],50),player('point',['PG'],40),player('wing',['SF'],30),player('center',['C'],20)];
 const p=optimizeLineup(ps);assert.equal(p.score,140);assert.equal(p.assignment.filter(Boolean).length,4);
});
test('injury slots, out status, questionable option and off-days are respected',()=>{
 const ps=[player('ready',['C'],10),player('injured',['C'],80,{slot:'IL'}),player('out',['C'],70,{status:'O'}),player('q',['C'],20,{status:'Q'}),player('off',['C'],60,{nba:'BOS'})];
 const p=optimizeLineup(ps,{playingTeams:['NYK'],includeQ:false});
 assert.equal(p.score,10);assert.equal(p.assignment.filter(Boolean).length,1);
 assert.equal(optimizeLineup([],{}).score,0);
});
test('stream estimate accounts for games lost and rejects waiver claims and exhausted adds',()=>{
 const input={candidate:player('add',['PG'],25,{availability:'FA'}),drop:player('drop',['PG'],20),games:2,newGames:3,adds:1,remaining:2};
 assert.equal(streamEstimate(input).net,35);
 assert(streamEstimate({...input,remaining:0}).error);
 assert(streamEstimate({...input,candidate:{...input.candidate,availability:'W (Nov 19)'}}).error);
 assert(streamEstimate({...input,newGames:2.5}).error);
});
test('matchup swaps scores correctly when selecting the second team',()=>{
 const d={teams:[{id:'a'},{id:'b'}],matchups:[{a:'a',b:'b',scoreA:11,scoreB:22,yahooEstimateA:100,yahooEstimateB:200}]};
 assert.equal(snapshotMatchup(d,'b').score,22);assert.equal(snapshotMatchup(d,'b').opponent.id,'a');
});
