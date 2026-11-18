import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,packageForm,compareGamesPlayed,statSwings,packageScenarios,nextOpponents,easternWeek,weeklyPackage,historicalAvailability,parseSharedTrade,compactTradeHash,sharedPlayerRef,rosterSpots,rosterSettings,rosterAdjustment} from '../dashboard/trade-model.mjs';
import {normalizeRosterConfig,savedRosterFilter,rosterConfigHash,parseRosterConfig} from '../dashboard/saved-rosters.mjs';
import {injuryHistory} from '../refresh-injury-history.mjs';

const base={pts:'1',reb:'1.2',ast:'1.5',st:'3',blk:'3',to:'1.5'};
const box={pts:20,reb:10,oreb:3,dreb:7,ast:5,st:1,blk:1,to:4};

test('roster adjustments apply cuts and pickups and keep existing and IL slots separate',()=>{
 const a=rosterSpots(1,2),b=rosterSpots(2,1);
 assert.deepEqual(rosterAdjustment(6,[18],a),{net:-12,remaining:0,breakEven:null});
 assert.deepEqual(rosterAdjustment(-6,[],b),{net:-6,remaining:1,breakEven:6});
 assert.deepEqual(rosterAdjustment(-6,[12],b),{net:6,remaining:0,breakEven:null});
 assert.equal(rosterAdjustment(-6,[null],b).net,null);
 assert.equal(rosterSpots(1,2,{open:1,ilOut:0,ilIn:0}).cuts,0);
 assert.equal(rosterSpots(1,2,{open:0,ilOut:0,ilIn:1}).cuts,0);
 assert.equal(rosterSpots(1,1,{open:0,ilOut:0,ilIn:1}).pickups,1);
 assert.equal(rosterSettings({regular:13,il:3},{open:15,ilIn:4},1,2).ilIn,2);
});

test('share links preserve roster limits, IL counts and adjustments',()=>{
 const roster={regular:14,il:3,a:{open:0,ilOut:1,ilIn:0,players:['_cc']},b:{open:0,ilOut:0,ilIn:0,players:['_dd']}};
 const hash=compactTradeHash({scoring:scoringWeights(base,false),split:false,names:['',''],a:['_aa'],b:['_bb','_ee'],roster});
 const parsed=parseSharedTrade(hash);
 assert.equal(parsed.roster.regular,14);
 assert.equal(parsed.roster.a.ilOut,1);
 assert.deepEqual(parsed.roster.b.players,['_dd']);
 assert.equal(parseSharedTrade(hash.replace('~_dd~','~_ee~')),null);
});

test('saved league links keep full and IL rosters and exclude them from free agents',()=>{
 const config={name:'Test League 🏀',regular:13,il:3,teams:[{name:'Milch',players:['Nikola Jokić'],injured:['Victor Wembanyama']},{name:'Other',players:['Amen Thompson'],injured:[]}]};
 assert.deepEqual(parseRosterConfig(rosterConfigHash(config)),config);
 const available=savedRosterFilter(config,config.teams[0],'pickup');
 assert.equal(available({name:'Nikola Jokic'}),false);
 assert.equal(available({name:'Victor Wembanyama'}),false);
 assert.equal(available({name:'Amen Thompson'}),false);
 assert.equal(available({name:'Yaxel Lendeborg'}),true);
 assert.equal(savedRosterFilter(config,config.teams[0],'cut')({name:'Victor Wembanyama'}),false);
 assert.equal(savedRosterFilter(config,config.teams[0],'trade')({name:'Victor Wembanyama'}),true);
 assert.equal(normalizeRosterConfig({...config,teams:[...config.teams,{name:'Duplicate',players:['Nikola Jokic'],injured:[]}]}),null);
});

test('weekly packages count both Eastern week boundaries across a daylight saving change',()=>{
 const dates=easternWeek(0,new Date('2026-03-09T02:00Z'));
 assert.deepEqual(dates,['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08']);
 const game=(date,status)=>({date,status,home:'LAL',away:'DEN'});
 const feed={refreshedDates:dates,games:[game('2026-03-02T04:59Z'),game('2026-03-02T05:00Z'),game('2026-03-09T03:59Z'),game('2026-03-09T04:00Z'),game('2026-03-04T00:00Z','Canceled')]};
 const players=[{nba:'LAL',stats:box}];
 const result=weeklyPackage(players,feed,scoringWeights(base,false),dates);
 assert.equal(result.games,2);
 assert.equal(result.total,79);
 assert.equal(result.daily.at(-1).games,1);
 assert.equal(weeklyPackage(players,{...feed,refreshedDates:dates.slice(0,-1)},{pts:1},dates).total,null);
});

test('versioned links keep split scoring and reject duplicate or unrecognized pick formats',()=>{
 const link=(a,b)=>'#trade='+encodeURIComponent(JSON.stringify([1,{pts:1,oreb:2,dreb:1,ast:1,st:3,blk:3,to:-2},true,['A & B','C'],a,b]));
 assert.equal(parseSharedTrade(link(['jalenbrunson'],['anthonydavis'])).scoring.oreb,2);
 assert.equal(parseSharedTrade(link(['jalenbrunson'],['jalenbrunson'])),null);
 assert.equal(parseSharedTrade(link(['<script>'],[])),null);
 assert.equal(parseSharedTrade('#trade=%'),null);
});

test('short trade links retain names, player references, and custom scoring',()=>{
 const a=sharedPlayerRef({id:'anthonydavis',profile:'https://www.rotowire.com/basketball/player/anthony-davis-3297'});
 assert.equal(a,'_2jl');
 const names=['A & B','Peña 🏀'];
 const scoring={pts:1,oreb:2,dreb:1,ast:1.5,st:3,blk:3,to:-1.25,reb:1.2};
 const hash=compactTradeHash({scoring,split:true,names,a:[a],b:['jalenbrunson']});
 assert.deepEqual(parseSharedTrade(hash),{scoring,split:true,names,a:[a],b:['jalenbrunson']});
 const defaults=compactTradeHash({scoring:scoringWeights(base,false),split:false,names:['',''],a:[a],b:['_3ed']});
 assert.equal(defaults,'#t=2~d~_2jl~_3ed');
 assert.equal(parseSharedTrade(defaults).scoring.reb,1.2);
 assert.equal(parseSharedTrade('#t=2~d~_2jl~_2jl'),null);
 assert.equal(parseSharedTrade('#t=2~1,2~_2jl~'),null);
});

test('injury history counts distinct regular-season game absences and excludes rest',()=>{
 const row=(id,phase,reason)=>`<tr><td>2025-11-01</td><td>${id}</td><td>WAS</td><td>${phase}</td><td>${reason}</td><td>yes</td></tr>`;
 const html=`<h1>Anthony Davis injury history</h1><h2>Games behind the totals</h2><details class="aud"><tbody>${row(1,'regular','Ankle sprain')}${row(1,'regular','Ankle sprain')}${row(2,'regular','Rest')}${row(3,'playoffs','Knee soreness')}</tbody></details></section>`;
 const record=injuryHistory(html,'Anthony Davis',2026);
 assert.equal(injuryHistory(html,'Jalen Brunson',2026),null);
 assert.deepEqual(record.seasons['2025'],{injury:1,other:1});
 assert.deepEqual(record.areas,[{area:'Ankle',games:1,seasons:1}]);
 const sample=historicalAvailability({history:{2025:79},stats:box},record,2026,{pts:1});
 assert.equal(sample.rate,1/80);
 assert.equal(sample.adjusted,19.75);
});
test('opponent outlook takes the first five eligible games and scores the last meeting with custom weights',()=>{
 const now=Date.parse('2026-11-18T00:00Z');
 const game=(day,home,away,extra)=>({date:`2026-11-${day}T01:00Z`,home,away,...extra});
 const player={nba:'DEN',opponentHistory:{LAL:{date:'2026-10-20',stats:box}}};
 const defense={LAL:{pointsAllowed:110,pointsPer100:108}};
 const games=[game(28,'DEN','POR'),game(17,'DEN','BOS'),game(19,'LAL','DEN'),game(20,'MIA','DEN',{status:'Postponed'}),game(21,'DEN','ATL',{completed:true}),game(22,'BOS','SAS'),game(23,'DEN','MEM'),game(24,'MIN','DEN'),game(25,'DEN','MIA'),game(26,'DEN','BOS')];
 const next=nextOpponents(player,{defense,games},scoringWeights(base,false),now);
 assert.deepEqual(next.map(row=>row.opponent),['LAL','MEM','MIN','MIA','BOS']);
 assert.equal(next[0].home,false);
 assert.equal(next[0].points,39.5);
 assert.equal(next[0].defense,defense.LAL);
 assert.equal(next[1].points,null);
});
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

test('availability compares shared seasons and form reports the shortest valid sample',()=>{
 const a={history:{2023:38,2024:41,2025:59},recent:[{pts:6},{pts:10},{pts:14}]};
 const b={history:{2024:70,2025:75},recent:[{pts:10},{pts:20}]};
 assert.deepEqual(compareGamesPlayed(a,b),{gameTotals:[{year:'2024',a:41,b:70},{year:'2025',a:59,b:75}],avgA:50,avgB:72.5});
 assert.equal(packageForm([a],{pts:2},2).points,16);
 assert.deepEqual(packageForm([a,b],{pts:2},10),{points:50,shortest:2,averages:[{stats:{pts:10}},{stats:{pts:15}}]});
 assert.equal(packageForm([a,{}],{pts:2},15),null);
});

test('trade floor and ceiling add individual quartiles and require five games per player',()=>{
 const p={gameLogs:[10,0,8,2,4,6].map(pts=>({pts}))};
 const q={gameLogs:[10,20,30,40,50].map(pts=>({pts}))};
 assert.deepEqual(packageScenarios([p,q],{pts:1}),{floor:22.5,ceiling:47.5});
 assert.equal(packageScenarios([q,{gameLogs:q.gameLogs.slice(0,4)}],{pts:1}),null);
});
