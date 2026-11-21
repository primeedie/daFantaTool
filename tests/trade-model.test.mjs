import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,packageForm,compareGamesPlayed,statSwings,packageScenarios,nextOpponents,easternWeek,weeklyPackage,historicalAvailability,parseSharedTrade,compactTradeHash,sharedPlayerRef,rosterSpots,rosterSettings,rosterAdjustment} from '../dashboard/trade-model.mjs';
import {normalizeRosterConfig,savedRosterFilter,rosterConfigHash,parseRosterConfig} from '../dashboard/saved-rosters.mjs';
import {injuryHistory} from '../refresh-injury-history.mjs';
import {pickerMatch,suggestFairTrades,lineupWeek,lineupHorizon,rankLineupTargets,lineupSwapImpact,swapLineup,playerUpside} from '../dashboard/trade-model.mjs';
import {playerKey} from '../dashboard/model.mjs';
import {bigBalls} from '../dashboard/big-balls.mjs';
import {smallBalls} from '../dashboard/small-balls.mjs';
import {estimateInjurySlots,matchingPublicLeague} from '../dashboard/saved-rosters.mjs';
import {rankStreamers,tradedRoster,counteroffers} from '../dashboard/trade-planner.mjs';

const base={pts:'1',reb:'1.2',ast:'1.5',st:'3',blk:'3',to:'1.5'};
const box={pts:20,reb:10,oreb:3,dreb:7,ast:5,st:1,blk:1,to:4};

test('Small Balls applies separate offensive and defensive rebound weights',()=>{
 const scoring=scoringWeights(smallBalls.scoring,true);
 assert.equal(scoring.oreb,1.3);
 assert.equal(scoring.dreb,1.2);
 assert.ok(Math.abs(tradePoints(box,scoring)-39.8)<1e-6);
});

test('roster tools score only usable starts and delay IL activation and its drop until the return date',()=>{
 const dates=['2026-11-20','2026-11-21'];
 const feed={refreshedDates:dates,games:dates.map(date=>({date:date+'T21:00Z',home:'LAL',away:'BOS'}))};
 const project=lineupWeek(feed,{pts:1},dates);
 const p=(id,pts)=>({id,name:id,nba:'LAL',position:'PG',stats:{pts}});
 const incumbent=p('incumbent',20),returning=p('returning',40);
 assert.equal(rankStreamers(project,[incumbent],[returning],'incumbent')[0].gain,40);
 assert.equal(project([incumbent,returning],{player:'returning',drop:'incumbent',from:dates[1],scale:.75}).points,50);
 assert.equal(project([incumbent,returning],{player:'returning',drop:'incumbent',from:dates[1],scale:1}).points,60);
 assert.equal(project([incumbent]).points,40);
});

test('counteroffers replace a player to narrow value and account for the required cut',()=>{
 const date='2026-11-20',weights={pts:1};
 const project=lineupWeek({refreshedDates:[date],games:[{date:date+'T21:00Z',home:'LAL',away:'BOS'}]},weights,[date]);
 const p=(id,pts)=>({id,name:id,nba:'LAL',position:'PG',stats:{pts}});
 const a=p('a',35),spare=p('spare',15),b=p('b',50),low=p('low',8);
 const teams={a:{active:[a,spare],injured:[],regular:2,il:3},b:{active:[b,low],injured:[],regular:2,il:3}};
 const offer={a:[a],b:[b]};
 const [counter]=counteroffers(project,teams,offer,weights);
 assert.deepEqual(counter.proposal.a,[a,spare]);
 assert.deepEqual(counter.rosters.b.cuts,[low]);
 assert.equal(counter.gains.b,-8);
 assert.equal(tradedRoster(teams,counter.proposal,'b'),null);
 assert.deepEqual(tradedRoster(teams,counter.proposal,'b',[low]).active,[a,spare]);
});

test('five-week forecasts exclude locked slates and the Cup final, and flag pending and missing matchups',()=>{
 const now=new Date('2026-11-20T01:00Z');
 const dates=Array.from({length:5},(_,index)=>easternWeek(index,now));
 const game=(date,away='BOS',extra={})=>({date,home:'LAL',away,...extra});
 const feed={
  refreshedDates:dates.flat().filter(date=>date!=='2026-12-08'),
  games:[
   game('2026-11-20T00:00Z'),game('2026-11-20T02:00Z'),
   game('2026-11-21T02:00Z'),game('2026-12-06T02:00Z','TBD'),
   game('2026-12-12T02:00Z','BOS',{nbaCupFinal:true}),game('2026-12-21T02:00Z')
  ]
 };
 const {weeks,project}=lineupHorizon(feed,{pts:1},now);
 assert.equal(weeks.length,5);
 assert.deepEqual(weeks[0].remaining,['2026-11-20','2026-11-21','2026-11-22']);
 assert.equal(weeks[2].tbd,true);
 assert.equal(weeks[3].covered,false);
 const player={id:'p',name:'Player',nba:'LAL',position:'PG',stats:{pts:20}};
 assert.equal(project([player]).points,40);
 assert.equal(project([player]).daily.at(-1).date,'2026-12-20');
 assert.equal(project([player]).daily.find(day=>day.date==='2026-12-05').gameCount,0);
 assert.equal(lineupHorizon({...feed,refreshedDates:dates.flat()},{pts:1},now).project([player]).points,40);
});

test('lineup targets favor usable starts and apply league eligibility across the full Eastern week',()=>{
 const dates=easternWeek(1,new Date('2026-11-19T11:00Z'));
 const player=(id,nba,position,pts)=>({id,name:id,nba,position,games:10,stats:{pts}});
 const centers=[40,35,30,25].map(pts=>player(`center${pts}`,'DEN','C',pts));
 const send=player('send','LAC','PG',19);
 const center=player('center24','DEN','C',24);
 const guard=player('guard','BOS','F',20);
 const costly=player('costly','BOS','PF',20);
 const uneven=player('uneven','BOS','PG',40);
 const games=[
  {date:'2026-11-24T02:00Z',home:'DEN',away:'LAC'},
  {date:'2026-11-30T04:30Z',home:'BOS',away:'NYK'},
  {date:'2026-11-28T02:00Z',home:'BOS',away:'NYK',status:'Postponed'}
 ];
 const feed={refreshedDates:dates,games,positions:{guard:['PG']}};
 const project=lineupWeek(feed,{pts:2},dates);
 assert.equal(project([...centers,send]).points,298);
 assert.equal(project([...centers,center]).benched,1);
 assert.equal(project([...centers,center]).daily[0].starters.filter(row=>row.slot==='C').length,2);
 assert.deepEqual(project([{id:'unknown',name:'Unknown'}]).missing,['Unknown']);
 const opponent=Array.from({length:4},(_,index)=>player(`guard${index}`,'BOS','PG',45));
 const candidates=[center,guard,costly,uneven];
 const rosters={a:[...centers,send],b:[...opponent,...candidates]};
 assert.deepEqual(rankLineupTargets(project,rosters,[send],candidates,{pts:2}),[]);
 const best={a:[send],b:[guard]};
 for(const key of ['a','b'])assert.equal(project.score(rosters[key]),project(rosters[key]).points);
 const impact=(key,other)=>lineupSwapImpact(project(rosters[key]),project(swapLineup(rosters[key],best[key],best[other])),best[key],best[other]);
 assert.deepEqual(impact('a','b'),{outgoingStarts:1,incomingStarts:1,otherStarterDelta:0,bestDay:{date:dates.at(-1),slot:'PG',gain:40},starterShift:null});
 assert.deepEqual(impact('b','a'),{outgoingStarts:0,incomingStarts:1,otherStarterDelta:0,bestDay:{date:dates[0],slot:'PG',gain:38},starterShift:null});
 assert.equal(lineupWeek({...feed,refreshedDates:dates.slice(0,-1)},{pts:2},dates),null);
});

test('public roster presets match normalized scoring, including rebound mode',()=>{
 const standard=scoringWeights({...bigBalls.scoring,to:'1.5'},false);
 const split=scoringWeights({...smallBalls.scoring,to:'1.5'},true);
 assert.equal(matchingPublicLeague(standard)?.id,'big-balls');
 assert.equal(matchingPublicLeague(split)?.id,'small-balls');
 assert.equal(matchingPublicLeague({...standard,reb:1.3}),null);
 assert.equal(matchingPublicLeague({...split,oreb:1.2}),null);
 assert.equal(matchingPublicLeague(null),null);
});

test('the public Big Balls preset has its league scoring and ten non-overlapping rosters',()=>{
 const league=normalizeRosterConfig(bigBalls);
 assert.equal(league.teams.length,10);
 assert.equal(league.regular,13);
 assert.equal(league.il,3);
 assert.equal(league.teams.reduce((sum,team)=>sum+team.players.length,0),125);
 assert.equal(league.teams.reduce((sum,team)=>sum+team.injured.length,0),20);
 const wolfgang=league.teams.find(team=>team.name==='Wolfgang');
 const alien=league.teams.find(team=>team.name==='Alien Kalbo');
 const black=league.teams.find(team=>team.name==='The Black C0ks');
 assert.ok(black.players.includes('Jaxson Hayes'));
 assert.deepEqual(estimateInjurySlots(alien,league.regular,new Set()).ilEstimate.regular,['Rui Hachimura']);
 assert.deepEqual(estimateInjurySlots(wolfgang,league.regular,new Set()).ilEstimate.regular,['Yanic Konan Niederhäuser']);
 assert.deepEqual(wolfgang.unassigned,['Yanic Konan Niederhäuser']);
 assert.equal(savedRosterFilter(league,wolfgang,'trade')({name:'Brayden Burries'}),false);
 assert.equal(savedRosterFilter(league,null,'pickup')({name:'Brayden Burries'}),true);
 assert.deepEqual(bigBalls.scoring,scoringWeights(base,false));
 assert.equal(savedRosterFilter(league,null,'pickup')({name:'Stephen Curry'}),false);
 for(const [manager,player] of [['Alien Kalbo','Rui Hachimura'],['Vinscoksukrz','Kasparas Jakučionis'],['Night Night','Devin Vassell']]){
  const team=league.teams.find(team=>team.name===manager);
  assert.ok(team.unassigned.includes(player));
  assert.equal(savedRosterFilter(league,team,'trade')({name:player}),true);
  assert.equal(savedRosterFilter(league,null,'pickup')({name:player}),false);
 }
 for(const [manager,player] of [['Night Night','Alex Caruso'],['The Black C0ks','Kris Dunn'],['John NBA','Toumani Camara'],['Alien Kalbo','Kyle Kuzma']]){
  const team=league.teams.find(team=>team.name===manager);
  assert.equal(savedRosterFilter(league,team,'trade')({name:player}),false);
 }
});

test('IL estimates use roster overflow and leave ambiguous injury assignments unresolved',()=>{
 const team={name:'Team',players:['Active','Out Today'],injured:['Already IL'],unassigned:['Pickup']};
 const flags=(...names)=>new Set(names.map(playerKey));
 const resolved=estimateInjurySlots(team,2,flags('Out Today'));
 assert.deepEqual(resolved.players,['Active','Pickup']);
 assert.deepEqual(resolved.injured,['Already IL','Out Today']);
 assert.deepEqual(resolved.ilEstimate.likely,['Out Today']);
 const ambiguous=estimateInjurySlots(team,2,flags('Out Today','Pickup'));
 assert.equal(ambiguous.ilEstimate.needed,1);
 assert.deepEqual(ambiguous.ilEstimate.candidates,['Out Today','Pickup']);
 assert.deepEqual(ambiguous.injured,team.injured);
 assert.deepEqual(ambiguous.unassigned,team.unassigned);
 assert.deepEqual(estimateInjurySlots(team,3,flags('Out Today')).players,['Active','Out Today','Pickup']);
 assert.deepEqual(estimateInjurySlots(team,2,flags()).unassigned,team.unassigned);
});

test('suggestions use only marked players and rank qualifying packages by gap',()=>{
 const player=(id,pts)=>({id,stats:{pts}});
 const outgoing=[player('star',50),player('a1',29),player('a2',20)];
 const targets=[player('b1',30),player('b2',20),player('unmatched',105),player('missing',null)];
 const offers=suggestFairTrades(outgoing,targets,{pts:1});
 assert.deepEqual(offers[0].a.players.map(p=>p.id),['a2']);
 assert.deepEqual(offers[0].b.players.map(p=>p.id),['b2']);
 assert.ok(offers.some(offer=>offer.a.players.length===1&&offer.b.players.length===2&&offer.balance.gap===0));
 assert.ok(offers.every(({balance})=>balance.percentage<=10));
 assert.deepEqual(suggestFairTrades([player('same',50)],[player('same',50)],{pts:1}),[]);
 assert.deepEqual(suggestFairTrades([player('x',10)],[player('y',20)],{pts:1}),[]);
});

test('a two-for-two offer can move four benched games into usable starts',()=>{
 const dates=['2026-11-20','2026-11-21'];
 const weights={pts:1};
 const game=(date,home,away)=>({date:date+'T21:00Z',home,away});
 const project=lineupWeek({refreshedDates:dates,games:[game(dates[0],'LAL','DEN'),game(dates[1],'NYK','BOS')]},weights,dates);
 const group=(team,points)=>points.map((pts,index)=>({
  id:team+index,name:team+index,nba:team,position:'PG',games:10,stats:{pts}
 }));
 const a=group('LAL',[24,25]),b=group('NYK',[24,25]);
 const incumbents=[35,36,37,38];
 const rosters={a:[...a,...group('DEN',incumbents)],b:[...b,...group('BOS',incumbents)]};
 const [offer]=rankLineupTargets(project,rosters,a,b,weights);
 assert.equal(offer.a.length,2);
 assert.equal(offer.b.length,2);
 assert.equal(offer.gain,49);
 assert.equal(offer.opponentGain,49);
 const reversed=rankLineupTargets(project,{a:rosters.b,b:rosters.a},b,a,weights);
 assert.deepEqual(reversed.map(offer=>offer.key),rankLineupTargets(project,rosters,a,b,weights).map(offer=>offer.key));
 assert.equal(project.score(swapLineup(rosters.a,a,b)),project(swapLineup(rosters.a,a,b)).points);
});

test('similar season values still fail if the projected gains are lopsided',()=>{
 const player=(id,pts)=>({id,name:id,games:10,stats:{pts}});
 const sent=player('sent',30),received=player('received',31);
 const own=player('own',15),other=player('other',15);
 const rosters={a:[sent,own],b:[received,other]};
 const project=roster=>{
  const side=roster.includes(own);
  const traded=side?roster.includes(received):roster.includes(sent);
  return {missing:[],points:100+(traded?(side?30:8):0)};
 };
 assert.deepEqual(rankLineupTargets(project,rosters,[sent],[received],{pts:1}),[]);
 assert.deepEqual(rankLineupTargets(project,{a:rosters.b,b:rosters.a},[received],[sent],{pts:1}),[]);
});

test('the player picker prioritizes exact nicknames and keeps NBA-team and name search',()=>{
 const jokic={id:'nikolajokic',name:'Nikola Jokić',nba:'DEN'};
 const wemby={id:'victorwembanyama',name:'Victor Wembanyama',nba:'SAS'};
 assert.equal(pickerMatch(jokic,playerKey('The Joker')),2);
 assert.equal(pickerMatch(wemby,playerKey('WEMBY')),2);
 assert.equal(pickerMatch(wemby,playerKey('The Joker')),0);
 assert.equal(pickerMatch(jokic,playerKey('Jokic')),1);
 assert.equal(pickerMatch(jokic,playerKey('DEN')),1);
});

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

test('player upside uses draft pedigree separately from current rank and logged production',()=>{
 const player={rank:7,games:12,stats:{pts:30},gameLogs:[60,40,35,25,20].map(pts=>({pts}))};
 const weights={pts:2};
 assert.deepEqual(playerUpside(player,weights,18),{season:60,preseason:7,current:18,ceiling:80,recent:72,ceilingGain:20,topTen:true,topTenRoom:true});
 assert.equal(playerUpside(player,weights,9).topTenRoom,false);
 assert.equal(playerUpside({...player,rank:11},weights,18).topTenRoom,false);
 const short=playerUpside({...player,games:4,gameLogs:player.gameLogs.slice(0,4)},weights,18);
 assert.equal(short.topTenRoom,false);
 assert.equal(short.ceiling,null);
 assert.equal(short.recent,null);
});
