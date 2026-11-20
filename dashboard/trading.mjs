import {nbaBadge,playerKey} from './public-ui.mjs';
import {setupRosterBook,savedRosterFilter} from './saved-rosters.mjs?v=league-scoring';
import {bigBalls} from './big-balls.mjs?v=2026-11-20';
import {smallBalls} from './small-balls.mjs?v=league-scoring';
import {boxFields,scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,compareGamesPlayed,statSwings,packageScenarios,packageForm,nextOpponents,easternWeek,weeklyPackage,lineupWeek,lineupHorizon,lineupWeekCount,rankLineupTargets,historicalAvailability,parseSharedTrade,compactTradeHash,sharedPlayerRef,isTradeHash,defaultRoster,rosterSpots,rosterSettings,rosterAdjustment,pickerMatch,suggestFairTrades,suggestionPoolLimit} from './trade-model.mjs?v=roster-tools';
import {rankStreamers,tradedRoster,counteroffers} from './trade-planner.mjs?v=roster-tools';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const playerBadge=player=>nbaBadge(player.nba,player.name);
const namedPlayerBadge=name=>nbaBadge(playersByName.get(playerKey(name))?.nba,name);
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const format=value=>value===null?'—':number.format(value);
const signed=value=>value===null?'—':`${value>0?'+':''}${format(value)}`;
const tone=value=>value>0?'fp-gain':value<0?'fp-loss':'';
const edgeLabel={fair:'Small edge for',edge:'Edge for',lopsided:'Big edge for'};
const tipoff=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const numberPattern=/\d{4}(?:-\d{2}-\d{2}|[–-]\d{2,4})|\d{1,2}:\d{2}|[+−-]?\d[\d,]*(?:\.\d+)?(?:%|\/\d+)?/g;
function colorNumbers(container){
 const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
 const nodes=[];
 while(walker.nextNode()){
  if(!walker.currentNode.parentElement?.closest('.number-token,script,style,option,textarea'))nodes.push(walker.currentNode);
 }
 for(const node of nodes){
  const matches=[...node.data.matchAll(numberPattern)];
  if(!matches.length)continue;
  const parts=document.createDocumentFragment();
  let start=0;
  for(const match of matches){
   const token=document.createElement('span');
   token.className='number-token';
   token.textContent=match[0];
   parts.append(node.data.slice(start,match.index),token);
   start=match.index+match[0].length;
  }
  parts.append(node.data.slice(start));
  node.replaceWith(parts);
 }
}
const managerNamesKey='real-balliggas-manager-names';
const managerNames={a:'',b:''};
const cleanName=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,24):'';
const manager=key=>managerNames[key.toLowerCase()]||`Manager ${key.toUpperCase()}`;
const managerLabel=key=>esc(manager(key));
const feedbackManager=key=>`<strong class="feedback-manager manager-${key.toLowerCase()}-text">${managerLabel(key)}</strong>`;
try {
 const saved=JSON.parse(localStorage.getItem(managerNamesKey)||'null');
 for(const key of ['a','b'])managerNames[key]=cleanName(saved?.[key]);
} catch {}
const form=$('#scoring-form');
const input=name=>form.elements.namedItem(name);
const settings=$('#trade-settings');
const board=$('#trade-board');
const tabList=$('#trade-tabs');
const tabs=[...tabList.querySelectorAll('[role="tab"]')];
const suggestionsPanel=$('#suggestions-panel');
const mobileTradeView=matchMedia('(max-width: 760px)');
const mobilePlayers=$('#toggle-mobile-players');
const mobileActions=$('#toggle-mobile-actions');
for(const button of [mobilePlayers,mobileActions])button.addEventListener('click',()=>{
 button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true'));
});

function selectTradeTab(active){
 for(const tab of tabs){
  const selected=tab===active;
  tab.setAttribute('aria-selected',String(selected));
  tab.tabIndex=selected?0:-1;
  document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected;
 }
 if(mobileTradeView.matches){
  const hasTeam=['a','b'].some(key=>rosterBook?.getTeam(key)||picks[key].length);
  mobilePlayers.setAttribute('aria-expanded',String(active.id==='hub-tab'||!hasTeam));
  const strip=tabList.getBoundingClientRect(),tab=active.getBoundingClientRect();
  if(tab.left<strip.left||tab.right>strip.right)tabList.scrollLeft+=tab.left-strip.left-6;
 }
 if(!suggestionsPanel.hidden){
  renderSuggestions();
  if(!dataset)loadPlayers().then(data=>{
   if(data)renderSuggestions();
   else $('#suggestion-status').textContent='Player data unavailable.';
  });
 }
 if(!$('#roster-tools-panel').hidden)renderRosterTools();
}
tabList.addEventListener('click',event=>{
 const tab=event.target.closest('[role="tab"]');
 if(tab)selectTradeTab(tab);
});
tabList.addEventListener('keydown',event=>{
 const index=tabs.indexOf(event.target);
 if(index<0)return;
 const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
 if(next===undefined)return;
 event.preventDefault();
 selectTradeTab(tabs[next]);
 tabs[next].focus();
});
const picker=$('#player-picker');
const search=$('#picker-search');
const sort=$('#picker-sort');
const picks={a:[],b:[]};
const candidates={a:new Set(),b:new Set()};
let offers=[],lineupTargets=[],targetRanking;
let plannerState,counterResults=[];
const roster={...defaultRoster,a:{open:0,ilOut:0,ilIn:0,players:[]},b:{open:0,ilOut:0,ilIn:0,players:[]}};
const rosterPanel=$('#trade-roster');
const requestedLeague=new URLSearchParams(location.search).get('league');
const settingsKey=requestedLeague===smallBalls.id?'dafantatool-small-balls-weights':'real-balliggas-trade-weights';
let weights,weightsPreset,side='a',pickerPurpose='trade',pickerLeague,draftPicker,dataset,dataRequest,rosterBook;
let currentRanks=new Map();
let playersByName=new Map();
let injuryData,injuryRequest;
let injuryHistoryData,historyRequest,historyFailed=false;
let outlookData,outlookRequest,outlookFailed=false;
let lineupProjection;
let chatTrade,chatVersion='';
let weeklyOffset=1;
let totalRebound='';
const sharedTrade=parseSharedTrade(location.hash);
let restoring=Boolean(sharedTrade);

try {
 const saved=JSON.parse(localStorage.getItem(settingsKey)||'null');
 if(saved){
  for(const key of Object.keys(boxFields))input(key).value=saved[key]??'';
  input('split').checked=saved.split===true;
 }
} catch {}
if(sharedTrade){
 for(const key of Object.keys(boxFields))input(key).value=sharedTrade.scoring[key];
 input('split').checked=sharedTrade.split;
 if(sharedTrade.roster)Object.assign(roster,sharedTrade.roster);
 for(const [index,key] of ['a','b'].entries()){
  managerNames[key]=cleanName(sharedTrade.names[index]);
  picks[key].push(...sharedTrade[key]);
 }
}

function toggleRebounds(){
 const split=input('split').checked;
 const reb=input('reb');
 if(split&&!reb.readOnly){totalRebound=reb.value;reb.value='';}
 if(!split&&reb.readOnly)reb.value=totalRebound;
 reb.readOnly=split;
 reb.required=!split;
 reb.placeholder=split?'Split below':'—';
 $('#split-rebounds').hidden=!split;
 for(const key of ['oreb','dreb']){
  input(key).disabled=!split;
  input(key).required=split;
 }
}
input('split').addEventListener('change',toggleRebounds);
toggleRebounds();

function activateTrade(save){
 const values=Object.fromEntries(Object.keys(boxFields).map(key=>[key,input(key).value]));
 const split=input('split').checked;
 weights=scoringWeights(values,split);
 if(!weights)return;
 if(dataset)currentRanks=seasonRanks(dataset.players,weights);
 input('to').value=weights.to;
 if(save)try {localStorage.setItem(settingsKey,JSON.stringify({...values,reb:split?totalRebound:values.reb,to:weights.to,split}));} catch {}
 settings.hidden=true;
 board.hidden=false;
 renderTrade();
 loadPlayers().then(data=>{if(data)renderTrade();});
 loadInjuries();
 loadInjuryHistory();
 loadOutlook();
}
form.addEventListener('submit',event=>{
 event.preventDefault();
 weightsPreset=null;
 activateTrade(true);
 $('#edit-scoring').focus();
});
$('#edit-scoring').addEventListener('click',()=>{
 board.hidden=true;
 settings.hidden=false;
 input('pts').focus();
});
function enableLeague(league,save){
 weightsPreset=league.id;
 input('split').checked=Object.hasOwn(league.scoring,'oreb')&&Object.hasOwn(league.scoring,'dreb');
 for(const key of Object.keys(boxFields))input(key).value=league.scoring[key]??'';
 totalRebound=league.scoring.reb??'';
 toggleRebounds();
 roster.regular=league.regular;
 roster.il=league.il;
 activateTrade(save);
}
for(const league of [bigBalls,smallBalls])$(`#use-${league.id}`).addEventListener('click',()=>{
 enableLeague(league,true);
 $('#edit-scoring').focus();
});
$('#clear-trade').addEventListener('click',()=>{
 picks.a.length=0;
 picks.b.length=0;
 for(const key of ['a','b'])Object.assign(roster[key],{ilOut:0,ilIn:0,players:[]});
 renderTrade();
});
const shareButton=$('#share-trade');
const shareStatus=$('#trade-share-status');
const shareUrl=$('#trade-share-url');
shareButton.addEventListener('click',async()=>{
 const url=new URL(location.href);
 const values={...weights};
 if(input('split').checked&&totalRebound!==''&&Number.isFinite(Number(totalRebound)))values.reb=Number(totalRebound);
 const refs=new Map(dataset.players.map(player=>[player.id,sharedPlayerRef(player)]));
 const sharedRoster={...roster};
 for(const key of ['a','b'])sharedRoster[key]={...roster[key],players:roster[key].players.map(id=>refs.get(id))};
 url.search='';
 url.hash=compactTradeHash({scoring:values,split:input('split').checked,names:[managerNames.a,managerNames.b],a:picks.a.map(id=>refs.get(id)),b:picks.b.map(id=>refs.get(id)),roster:sharedRoster});
 try {
  await navigator.clipboard.writeText(url.href);
  shareUrl.hidden=true;
  shareStatus.textContent='Trade link copied.';
 } catch {
  shareUrl.value=url.href;
  shareUrl.hidden=false;
  shareUrl.select();
  shareStatus.textContent='Copy this link to share the trade.';
 }
});
const managerDialog=$('#manager-dialog');
$('#rename-managers').addEventListener('click',()=>{
 for(const key of ['a','b'])$(`#manager-${key}-name`).value=managerNames[key];
 managerDialog.showModal();
 $('#manager-a-name').focus();
});
$('#cancel-manager-names').addEventListener('click',()=>managerDialog.close());
$('#manager-form').addEventListener('submit',event=>{
 event.preventDefault();
 for(const key of ['a','b'])managerNames[key]=cleanName($(`#manager-${key}-name`).value);
 try {localStorage.setItem(managerNamesKey,JSON.stringify(managerNames));} catch {}
 managerDialog.close();
 renderTrade();
});

function statPill(key,shown,extraClass=''){
 return `<span class="metric-pill ${extraClass}" data-stat="${key}"><span class="metric-label">${boxFields[key]}</span><b>${shown}</b></span>`;
}

function playerStats(player){
 const keys=input('split').checked?Object.keys(boxFields):['pts','reb','ast','st','blk','to'];
 return keys.map(key=>statPill(key,format(player.stats?.[key]??null))).join('');
}
const rankText=rank=>rank==null?'—':`#${rank}`;
const seasonRank=player=>currentRanks.get(player.id);
const rankSummary=player=>`Season ${rankText(seasonRank(player))} · Draft ${rankText(player.rank)}${player.games>0?` · ${player.games} GP`:''}`;
const fp=player=>weights?tradePoints(player.stats,weights):null;
const occupied=id=>picks.a.includes(id)||picks.b.includes(id);
const other=key=>key==='a'?'b':'a';
function mixedLeagueSelection(){
 const a=rosterBook?.getTeam('a')?.config,b=rosterBook?.getTeam('b')?.config;
 return a?.id&&b?.id&&a.id!==b.id;
}
const spotsFor=key=>rosterSpots(picks[key].length,picks[other(key)].length,roster[key]);
const pickerOccupied=id=>occupied(id)||pickerPurpose==='roster'&&roster[side].players.includes(id);
function rosterScope(key,action){
 const saved=rosterBook?.getTeam(key);
 const config=saved?.config||(action==='pickup'?rosterBook?.getTeam(other(key))?.config:null);
 return {config,team:saved?.team,allows:savedRosterFilter(config,saved?.team,action)};
}

rosterPanel.addEventListener('change',event=>{
 const field=event.target;
 if(field.dataset.rosterLimit)roster[field.dataset.rosterLimit]=field.value;
 else if(field.dataset.rosterOption)roster[field.closest('[data-roster-team]').dataset.rosterTeam][field.dataset.rosterOption]=field.value;
 else return;
 renderTrade();
});

function renderTrade(){
 const totals={};
 const selected={};
 for(const key of ['a','b']){
  $(`#trade-${key}-title`).textContent=manager(key);
  $(`#balance-${key}-name`).textContent=manager(key);
  const players=picks[key].map(id=>dataset?.players.find(player=>player.id===id)).filter(Boolean);
  selected[key]=players;
  const scores=players.map(fp);
  const complete=scores.every(score=>score!==null);
  totals[key]=complete?scores.reduce((sum,score)=>sum+score,0):null;
  const sum=$(`#trade-${key}-total`);
  sum.textContent=players.length?(complete?`${format(totals[key])} FP / game`:'Stats missing'):'';
  $(`#trade-${key}-players`).innerHTML=players.length?players.map(player=>{
   const points=fp(player);
   const profile=player.profile?` · <a href="${esc(player.profile)}" target="_blank" rel="noopener noreferrer">RotoWire</a>`:'';
   return `<article class="trade-card"><h3>${nbaBadge(player.nba,player.name)}</h3><button class="button" type="button" data-remove="${esc(player.id)}" data-side="${key}" aria-label="Remove ${esc(player.name)}">×</button><span class="sub">${esc(player.position)} · ${rankSummary(player)}${profile}</span><strong class="trade-fp">${points===null?'No score':`${format(points)} <span>FP / game</span>`}</strong><div class="trade-stats">${playerStats(player)}</div></article>`;
  }).join(''):'<p class="trade-empty sub">No players selected.</p>';
 }
 const balance=renderBalance(totals);
 const rosterResults=renderRoster(selected,totals);
 plannerState={offer:selected,adjustments:rosterResults};
 renderLineupFit(selected,rosterResults);
 renderContext(selected,totals,balance,rosterResults);
 if(!suggestionsPanel.hidden)renderSuggestions();
 if(!$('#roster-tools-panel').hidden)renderRosterTools();
 shareButton.disabled=!dataset||!(selected.a.length||selected.b.length);
 colorNumbers(board);
}

function renderSuggestions(rank=false){
 if(suggestionsPanel.hidden)return;
 const status=$('#suggestion-status'),results=$('#suggestion-results'),pools=$('#suggestion-pools');
 if(!dataset){status.textContent='Loading players…';return;}
 const selected={};
 pools.innerHTML=['a','b'].map(key=>{
  const {team,allows}=rosterScope(key,'trade');
  const rosterRows=team?[...team.players.map(name=>({name,slot:team.ilEstimate?.regular.includes(name)?'Estimated regular':null})),...team.injured.map(name=>({name,slot:team.ilEstimate?.likely.includes(name)?'Likely IL':'IL'})),...(team.unassigned||[]).map(name=>({name,slot:'Slot unconfirmed'}))]:
   [...candidates[key]].map(id=>({name:dataset.players.find(player=>player.id===id)?.name||''}));
  const rows=rosterRows.map(row=>({...row,player:playersByName.get(playerKey(row.name))}));
  const valid=new Set(rows.map(row=>row.player).filter(player=>player&&allows(player)).map(player=>player.id));
  for(const id of candidates[key])if(!valid.has(id))candidates[key].delete(id);
  selected[key]=rows.map(row=>row.player).filter(player=>player&&candidates[key].has(player.id));
  const heading=key==='a'?`${managerLabel('a')} is willing to send`:`Targets from ${managerLabel('b')}`;
  const list=rows.map(({name,slot,player})=>{
   const id=player?.id||'';
   const checked=candidates[key].has(id);
   const points=player?fp(player):null;
   const disabled=points===null||candidates[other(key)].has(id)||!checked&&candidates[key].size>=suggestionPoolLimit;
   return `<label><input type="checkbox" data-candidate="${esc(id)}" data-side="${key}" ${checked?'checked':''} ${disabled?'disabled':''}><span>${nbaBadge(player?.nba,name)}${slot?` <small class="sub">${esc(slot)}</small>`:''}</span><small class="${points!==null?'trade-fp':'sub'}">${points!==null?`${format(points)} FP`:'No stats'}</small></label>`;
  }).join('');
  return `<section class="manager-impact"><h3 class="manager-${key}-text">${heading}</h3>${team?`<p class="sub">${esc(team.name)} · ${candidates[key].size} marked</p>`:''}<div class="suggestion-pool-list">${list}</div>${team?'':`<button class="button" type="button" data-suggestion-pick="${key}" ${candidates[key].size>=suggestionPoolLimit?'disabled':''}>${key==='a'?'Choose players to offer':'Choose targets'}</button>`}</section>`;
 }).join('');
 const mixedLeagues=mixedLeagueSelection();
 offers=mixedLeagues?[]:suggestFairTrades(selected.a,selected.b,weights);
 status.textContent=mixedLeagues?'Choose two teams from the same league.':!selected.a.length||!selected.b.length?'Mark at least one player on each side.':offers.length?'Closest matches first. For uneven offers, review roster spots in the Hub.':'No fair matches among the marked players.';
 results.innerHTML=offers.map(({a,b,balance},index)=>{
  const offerSide=(key,pkg)=>`<p>${feedbackManager(key)} sends ${pkg.players.map(player=>nbaBadge(player.nba,player.name)).join(' ')} · <strong class="trade-fp">${format(pkg.points)} FP/game</strong></p>`;
  return `<article class="suggestion-offer"><header><strong>${a.players.length}-for-${b.players.length} · ${format(balance.percentage)}% gap</strong><button type="button" class="button" data-load-offer="${index}">Load in Hub</button></header>${offerSide('a',a)}${offerSide('b',b)}</article>`;
 }).join('');
 renderLineupTargets(selected,rank);
 colorNumbers(suggestionsPanel);
}

suggestionsPanel.addEventListener('change',event=>{
 const field=event.target.closest('[data-candidate]');
 if(!field||field.disabled)return;
 const {side:key,candidate}=field.dataset;
 if(field.checked)candidates[key].add(candidate);
 else candidates[key].delete(candidate);
 renderSuggestions();
 const replacement=suggestionsPanel.querySelector(`[data-side="${key}"][data-candidate="${CSS.escape(candidate)}"]`);
 (replacement||suggestionsPanel.querySelector(`[data-suggestion-pick="${key}"]`))?.focus();
});

suggestionsPanel.addEventListener('click',event=>{
 if(event.target.closest('#rank-lineup-targets')){
  const button=$('#rank-lineup-targets');
  button.disabled=true;
  $('#target-status').textContent='Checking five weeks of lineup fits…';
  setTimeout(()=>renderSuggestions(true),50);
  return;
 }
 const action=event.target.closest('[data-load-offer], [data-load-target], [data-suggestion-pick]');
 if(!action)return;
 if(action.dataset.loadOffer!==undefined||action.dataset.loadTarget!==undefined){
  const offer=offers[Number(action.dataset.loadOffer)],target=lineupTargets[Number(action.dataset.loadTarget)];
  if(!offer&&!target)return;
  for(const key of ['a','b']){
   const players=offer?offer[key].players:[key==='a'?target.send:target.target];
   picks[key]=players.map(player=>player.id);
   Object.assign(roster[key],{ilOut:0,ilIn:0,players:[]});
  }
  const tab=offer?$('#hub-tab'):$('#lineup-tab');
  selectTradeTab(tab);
  renderTrade();
  tab.focus();
  return;
 }
 const key=action.dataset.suggestionPick;
 const {allows}=rosterScope(key,'trade');
 const remaining=()=>suggestionPoolLimit-candidates[key].size;
 draftPicker={
  allows,remaining,rostered:player=>candidates.a.has(player.id)||candidates.b.has(player.id),
  add(player){
   if(remaining()>0&&allows(player)&&fp(player)!==null&&!this.rostered(player))candidates[key].add(player.id);
   renderSuggestions();
  }
 };
 pickerPurpose='suggestion';
 openPicker(key==='a'?`Players ${manager('a')} can offer`:`Targets from ${manager('b')}`);
});

function renderRoster(selected,totals){
 const limits=rosterSettings(roster,null,0,0);
 roster.regular=limits.regular;
 roster.il=limits.il;
 const complete=selected.a.length&&selected.b.length;
 rosterPanel.hidden=!complete;
 if(!complete&&dataset&&!restoring)for(const key of ['a','b'])roster[key].players.length=0;
 if(!complete)return null;
 $('#roster-limit-label').textContent=`${roster.regular} regular spots · ${roster.il} IL`;
 for(const field of rosterPanel.querySelectorAll('[data-roster-limit]'))field.value=roster[field.dataset.rosterLimit];
 const base=managerChanges(totals.a,totals.b);
 const results={};
 const cards=['a','b'].map(key=>{
  const state=roster[key];
  const outgoing=selected[key].length,incoming=selected[other(key)].length;
  const savedTeam=rosterBook?.getTeam(key)?.team;
  const verifiedSlots=savedTeam&&!savedTeam.unassigned?.length;
  if(verifiedSlots){
   state.open=Math.max(0,roster.regular-savedTeam.players.length);
   const injured=new Set(savedTeam.injured.map(playerKey));
   state.ilOut=selected[key].filter(player=>injured.has(playerKey(player.name))).length;
  }
  const options=rosterSettings(roster,state,outgoing,incoming);
  for(const name of ['open','ilOut','ilIn'])state[name]=options[name];
  const controls=rosterPanel.querySelector(`[data-roster-team="${key}"]`);
  controls.querySelector('legend').textContent=manager(key);
  const room=verifiedSlots?Math.max(0,roster.il-savedTeam.injured.length+state.ilOut):roster.il;
  const maxima={open:roster.regular,ilOut:Math.min(outgoing,roster.il),ilIn:Math.min(incoming,roster.il,room)};
  state.ilIn=Math.min(state.ilIn,maxima.ilIn);
  for(const field of controls.querySelectorAll('[data-roster-option]')){
   field.max=maxima[field.dataset.rosterOption];
   field.value=state[field.dataset.rosterOption];
   field.disabled=Boolean(verifiedSlots)&&field.dataset.rosterOption!=='ilIn';
  }
  const spots=rosterSpots(outgoing,incoming,state);
  const mode=spots.cuts?'Cut':'Pickup';
  if(state.mode&&state.mode!==mode)state.players.length=0;
  state.mode=mode;
  const allowed=spots.cuts||spots.pickups;
  const filter=rosterScope(key,spots.cuts?'cut':'pickup').allows;
  const players=state.players.map(id=>dataset.players.find(player=>player.id===id)).filter(player=>player&&!occupied(player.id)&&filter(player)).slice(0,allowed);
  state.players=players.map(player=>player.id);
  const result=rosterAdjustment(base[key].net,players.map(fp),spots);
  results[key]={...result,spots,mode,players};
  const detail=spots.cuts?`${spots.cuts} required cut${spots.cuts===1?'':'s'} · ${result.remaining} left to select`:spots.pickups?
   `${spots.pickups} regular spot${spots.pickups===1?' opens':'s open'} · ${result.remaining} left open`:spots.change>0?`Uses ${spots.change} existing regular opening${spots.change===1?'':'s'}`:'No cuts or new openings';
  const status=spots.cuts&&result.remaining?'Before remaining cuts':'Adjusted FP/game';
  const playerRows=players.map(player=>`<div><span>${nbaBadge(player.nba,player.name)} · ${format(fp(player))} FP</span><button type="button" class="button" data-roster-remove="${esc(player.id)}" data-side="${key}" aria-label="Remove ${esc(player.name)}">Remove</button></div>`).join('');
  const action=result.remaining?`<button type="button" class="button" data-roster-pick="${key}">${spots.cuts?'Choose cut':'Choose pickup'}</button>`:'';
  const breakEven=result.breakEven===null?'':result.breakEven===0?'<p class="sub roster-break-even">Already at or above break-even.</p>':
   `<p class="sub roster-break-even">Break-even · <strong>${format(result.breakEven)} FP/game</strong>${result.remaining>1?` combined across ${result.remaining} open spots`:''}</p>`;
  const slotNote=savedTeam?.unassigned?.length?'<p class="sub">Slot assignments are unconfirmed. Check Roster settings before comparing cuts.</p>':
   savedTeam?.ilEstimate?.likely.length?'<p class="sub">Roster adjustments use estimated IL assignments.</p>':'';
  return `<section class="manager-impact"><h3 class="manager-${key}-text">${managerLabel(key)}</h3><strong class="manager-net ${tone(result.net)}">${signed(result.net)} FP</strong><div class="sub">${status}</div><p class="sub">${detail}</p>${slotNote}${playerRows?`<div class="roster-actions">${playerRows}</div>`:''}${action}${breakEven}</section>`;
 });
 $('#roster-results').innerHTML=cards.join('');
 return results;
}

function renderBalance(totals){
 const panel=$('#trade-balance');
 panel.hidden=!picks.a.length||!picks.b.length;
 if(panel.hidden)return;
 const scale=$('#trade-scale'),verdict=$('#trade-verdict'),delta=$('#trade-delta');
 const changes=managerChanges(totals.a,totals.b);
 $('#manager-impacts').innerHTML=Object.entries(changes).map(([key,{incoming,outgoing,net}])=>`<section class="manager-impact"><h3 class="manager-${key}-text">${managerLabel(key)}</h3><strong class="manager-net ${tone(net)}">${signed(net)} FP</strong><span class="sub">Net per game</span><dl><div><dt>Receives</dt><dd class="trade-fp">${format(incoming)} FP</dd></div><div><dt>Sends</dt><dd class="trade-fp">${format(outgoing)} FP</dd></div></dl></section>`).join('');
 const balance=tradeBalance(totals.b,totals.a);
 scale.hidden=!balance;
 if(!balance){
  verdict.textContent='Not enough stats';
  delta.textContent='A comparison needs stats for every selected player.';
  return;
 }
 const {gap,percentage,level,leader,position}=balance;
 const winner=leader&&manager(leader);
 if(!winner)verdict.textContent='Even on season averages';
 else verdict.innerHTML=`${level==='fair'?'Balanced · small edge for':edgeLabel[level]} ${feedbackManager(leader)}`;
 if(winner)delta.innerHTML=`${feedbackManager(leader)} gains ${format(gap)} FP / game on season averages. The packages are ${format(percentage)}% apart.`;
 else delta.textContent='Both packages have the same FP per game.';
 scale.setAttribute('aria-label',`${verdict.textContent}. ${delta.textContent}`);
 $('#balance-marker').style.left=`${position}%`;
 return balance;
}

async function loadInjuries(){
 if(injuryRequest)return injuryRequest;
 injuryRequest=fetch('./trade-injuries.json').then(async response=>{
  if(!response.ok)throw new Error('Injury report unavailable');
  injuryData=await response.json();
  if(dataset)rosterBook.setInjuryEstimates(dataset.players,injuryData);
  if(weights)renderTrade();
 }).catch(()=>{injuryRequest=null;});
 return injuryRequest;
}

function loadInjuryHistory(){
 if(historyRequest)return historyRequest;
 historyFailed=false;
 historyRequest=fetch('./trade-injury-history.json').then(async response=>{
  if(!response.ok)throw new Error('Injury history unavailable');
  injuryHistoryData=await response.json();
 }).catch(()=>{historyFailed=true;historyRequest=null;}).then(renderTrade);
 return historyRequest;
}

function injuryHistoryTable(incoming){
 const title='<h3>Injury history</h3>';
 if(!injuryHistoryData)return `<section class="trade-subsection">${title}<p class="sub">${historyFailed?'Injury history unavailable.':'Loading injury history…'}</p></section>`;
 const {currentSeason,players}=injuryHistoryData;
 const years=Array.from({length:4},(_,index)=>currentSeason-3+index);
 const rows=Object.entries(incoming).flatMap(([key,group])=>group.map(player=>{
  const record=players[player.id];
  const sample=historicalAvailability(player,record,currentSeason,weights);
  const recent=record?.recent.map(({date,reason})=>`${esc(reason)} · ${esc(date)}`).join('<br>')||'—';
  const topAreas=record?.areas.slice(0,2).map(({area,games,seasons})=>`${esc(area)} · ${games} G${seasons>1?` across ${seasons} seasons`:''}`).join('<br>')||'—';
  const badge=playerBadge(player);
  const name=record?`<a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">${badge}</a>`:badge;
  return `<tr><th scope="row">${name}<small class="sub form-coverage">To ${managerLabel(key)}</small></th>${years.map(year=>`<td class="num">${record?record.seasons[year]?.injury??0:'—'}</td>`).join('')}<td>${topAreas}</td><td>${recent}</td><td class="num">${sample?.rate==null?'—':`${format(100*sample.rate)}%<small class="sub form-coverage">${sample.missed}/${sample.games} games</small>`}</td><td class="num"><b class="trade-fp">${format(sample?.adjusted??null)}</b></td></tr>`;
 })).join('');
 const adjusted=Object.fromEntries(Object.entries(incoming).map(([key,group])=>{
  const values=group.map(player=>historicalAvailability(player,players[player.id],currentSeason,weights)?.adjusted);
  return [key,values.length&&values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0):null];
 }));
 const packageNote=adjusted.a!==null&&adjusted.b!==null?`<p>${feedbackManager('a')} receives <b class="trade-fp">${format(adjusted.a)} FP</b> and ${feedbackManager('b')} receives <b class="trade-fp">${format(adjusted.b)} FP</b> per game in the historical availability scenario.</p>`:'';
 return `<section class="trade-subsection">${title}<div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Player</th>${years.map(year=>`<th class="num">${year}–${String(year+1).slice(-2)}</th>`).join('')}<th>Most affected areas</th><th>Recent reported reasons</th><th class="num">Injury absence rate</th><th class="num">Adjusted FP / game</th></tr></thead><tbody>${rows}</tbody></table></div>${packageNote}<p class="sub">Season columns count documented regular-season injury absences. The rate uses games played and documented injury absences across up to three completed seasons, with a minimum of 50 combined games. Adjusted FP applies that historical rate to the season average as a scenario. A dash means coverage or sample size is insufficient.</p></section>`;
}

function loadOutlook(){
 if(outlookRequest)return outlookRequest;
 outlookFailed=false;
 outlookRequest=fetch('./trade-outlook.json?v=five-weeks').then(async response=>{
  if(!response.ok)throw new Error('NBA schedule unavailable');
  const feed=await response.json();
  if(!Array.isArray(feed.games))throw new Error('Invalid NBA schedule');
  outlookData=feed;
 }).catch(()=>{outlookFailed=true;outlookRequest=null;}).then(renderTrade);
 return outlookRequest;
}

const shortDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
const weekdayDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
const slateDate=date=>new Date(`${date}T12:00:00Z`);

function currentHorizon(){
 const now=new Date();
 if(lineupProjection?.feed!==outlookData||lineupProjection?.weights!==weights||lineupProjection?.minute!==Math.floor(+now/60000)){
  const horizon=lineupHorizon(outlookData||{},weights,now);
  const prior=lineupProjection;
  const project=prior?.feed===outlookData&&prior?.weights===weights&&prior?.scope===horizon.scope?prior.project:horizon.project;
  lineupProjection={...horizon,feed:outlookData,weights,minute:Math.floor(+now/60000),project};
 }
 return lineupProjection;
}

const lineupDateLabel=(first,last=first)=>`${shortDate.format(slateDate(first[0]))} – ${shortDate.format(slateDate(last.at(-1)))} ET`;
const lineupScheduleStatus=()=>outlookData?'Schedule coverage is incomplete.':outlookFailed?'NBA schedule unavailable.':'Loading NBA schedule…';
const weekName=index=>index===0?'This week, remaining':index===1?'Next week':`In ${index} weeks`;
const rosterPlayers=team=>team.players.map(name=>playersByName.get(playerKey(name))||{id:`missing:${playerKey(name)}`,name});
const lineupAssumptions=teams=>[
 'Uses season averages and 10 starting slots. Saved IL players sit.',
 teams.some(team=>team.ilEstimate?.likely.length||team.ilEstimate?.regular.length)?'Uses estimated roster slots where marked in Saved rosters.':'',
 teams.some(team=>team.unassigned?.length)?'Players with unconfirmed roster spots are excluded.':''
].filter(Boolean).join(' ');

function lineupTips(daily){
 const slates=daily.filter(day=>day.gameCount);
 const busy=[...slates].sort((a,b)=>b.bench.length-a.bench.length).find(day=>day.bench.length);
 const light=[...slates].sort((a,b)=>b.open.length-a.open.length||b.gameCount-a.gameCount).find(day=>day.open.length);
 const label=day=>weekdayDate.format(slateDate(day.date));
 const tips=[
  busy&&`Set your lineup for <strong>${label(busy)}</strong>. Bench ${busy.bench.map(playerBadge).join(', ')} to use the higher projected starters below.`,
  light&&`Check streamers for <strong>${label(light)}</strong>. Open slots: ${[...new Set(light.open)].map(slot=>`${slot} ×${light.open.filter(value=>value===slot).length}`).join(' · ')}.`
 ].filter(Boolean);
 return tips.length?`<ul class="lineup-tips">${tips.map(tip=>`<li>${tip}</li>`).join('')}</ul>`:'';
}

function lineupForecast(before,after,weeks){
 const beforeDays=new Map(before?.daily.map(day=>[day.date,day]));
 const afterDays=new Map(after?.daily.map(day=>[day.date,day]));
 const score=days=>days.reduce((sum,day)=>sum+day.score,0);
 const rows=weeks.map(({dates,remaining,covered,tbd},index)=>{
  const heading=`<th scope="row">${weekName(index)}<small class="sub form-coverage">${lineupDateLabel(dates)}${tbd?' · Matchups TBD':''}</small></th>`;
  if(!covered||!remaining.length)return `<tr>${heading}<td colspan="3">${covered?'No slates left':'Schedule incomplete'}</td></tr>`;
  const base=score(remaining.map(date=>beforeDays.get(date)));
  const newPoints=after?score(remaining.map(date=>afterDays.get(date))):null;
  const delta=newPoints===null?null:Math.round((newPoints-base)*100)/100;
  return `<tr>${heading}<td>${format(base)}</td><td>${format(newPoints)}</td><td class="${tone(delta)}">${signed(delta)}</td></tr>`;
 }).join('');
 const focus=after||before;
 const groups=weeks.map(({remaining,covered},index)=>{
  if(!covered||!remaining.length)return '';
  const days=remaining.map(date=>(after?afterDays:beforeDays).get(date));
  const daily=days.map(day=>{
   const starters=day.starters.map(({player,slot})=>`<span class="lineup-slot">${slot} ${playerBadge(player)}</span>`).join('');
   const bench=day.bench.map(playerBadge).join(' ');
   return `<tr><th scope="row">${shortDate.format(slateDate(day.date))}</th><td>${format(day.score)}<span class="lineup-mobile-label" aria-hidden="true"> FP</span></td><td><span class="lineup-mobile-label" aria-hidden="true">Start</span><div class="lineup-players">${starters||'—'}</div></td><td><span class="lineup-mobile-label" aria-hidden="true">Bench</span><div class="lineup-players">${bench||'—'}</div></td></tr>`;
  }).join('');
  return `<details><summary>${weekName(index)} · Best daily starts</summary><div class="table-wrap"><table class="lineup-daily" aria-label="Projected daily lineup"><thead><tr><th scope="col">ET date</th><th scope="col">FP</th><th scope="col">Start</th><th scope="col">Bench</th></tr></thead><tbody>${daily}</tbody></table></div></details>`;
 }).join('');
 const missing=[...new Set([...(before?.missing||[]),...(after?.missing||[])])];
 const delta=after?Math.round((after.points-before.points)*100)/100:null;
 const total=before?`<tfoot><tr><th scope="row">${weeks.every(week=>week.covered)?'Total':'Covered total'}</th><td>${format(before.points)}</td><td>${format(after?.points??null)}</td><td class="${tone(delta)}">${signed(delta)}</td></tr></tfoot>`:'';
 return `<div class="table-wrap"><table class="lineup-totals"><thead><tr><th scope="col">Week</th><th scope="col">Before FP</th><th scope="col">After FP</th><th scope="col">Net FP</th></tr></thead><tbody>${rows}</tbody>${total}</table></div>
  ${missing.length?`<p class="sub">Partial estimate. Missing projection data for ${missing.map(namedPlayerBadge).join(', ')}.</p>`:''}
  ${focus?lineupTips(focus.daily):''}${groups}`;
}

function renderLineupFit(selected,adjustments){
 const results=$('#lineup-results');
 const saved={a:rosterBook.getTeam('a'),b:rosterBook.getTeam('b')};
 if(!saved.a&&!saved.b){results.innerHTML='<p class="sub">Choose a saved team above to see its five-week projection.</p>';return;}
 const {weeks,project}=currentHorizon();
 $('#lineup-week').textContent=lineupDateLabel(weeks[0].dates,weeks.at(-1).dates);
 if(saved.a?.team===saved.b?.team){results.innerHTML='<p class="sub">Choose two different saved teams.</p>';return;}
 if(mixedLeagueSelection()){results.innerHTML='<p class="sub">Choose two teams from the same league.</p>';return;}
 if(!dataset||!outlookData){results.innerHTML=`<p class="sub">${!dataset?'Player stats loading…':lineupScheduleStatus()}</p>`;return;}
 const canTrade=adjustments&&saved.a&&saved.b&&['a','b'].every(key=>selected[key].every(savedRosterFilter(saved[key].config,saved[key].team,'trade')));
 const cards=['a','b'].filter(key=>saved[key]).map(key=>{
  const {team,config}=saved[key];
  const active=rosterPlayers(team);
  const before=project?.(active);
  const heading=`<h3 class="manager-${key}-text">${managerLabel(key)}</h3><p class="sub">${esc(team.name)}</p>`;
  const fail=reason=>`${heading}<p class="sub">${reason}</p>${lineupForecast(before,null,weeks)}`;
  if(!canTrade||!project)return heading+lineupForecast(before,null,weeks);
  const opponent=saved[other(key)].team;
  if([...selected[key],...selected[other(key)]].some(player=>[...(team.unassigned||[]),...(opponent.unassigned||[])].some(name=>playerKey(name)===playerKey(player.name))))return fail('Confirm the roster spots of the traded players to compare this lineup.');
  const injured=new Set(opponent.injured.map(playerKey));
  const incoming=selected[other(key)].filter(player=>!injured.has(playerKey(player.name)));
  const nonRegular=new Set([...team.injured,...(team.unassigned||[])].map(playerKey));
  if(incoming.some(player=>nonRegular.has(playerKey(player.name))))return fail('An incoming player is already on this saved team.');
  if(roster[key].ilIn>selected[other(key)].length-incoming.length)return fail('The incoming IL spots include a player listed as active on the saved roster.');
  const adjustment=adjustments[key];
  const removed=new Set([...selected[key],...(adjustment.mode==='Cut'?adjustment.players:[])].map(player=>player.id));
  const afterPlayers=[
   ...active.filter(player=>!removed.has(player.id)),
   ...incoming,...(adjustment.mode==='Pickup'?adjustment.players:[])
  ];
  if(new Set(afterPlayers.map(player=>player.id)).size!==afterPlayers.length)return fail('An incoming player is already on this saved team.');
  if(afterPlayers.length>config.regular)return fail('Choose the remaining cuts in Roster adjustments.');
  const after=project(afterPlayers);
  return heading+lineupForecast(before,after,weeks);
 });
 const tradeNote=!saved.a||!saved.b?'Choose two saved teams and a trade to see after-trade totals.':adjustments&&!canTrade?'Each outgoing player must belong to their selected saved team.':'';
 results.innerHTML=`<p class="sub">${lineupAssumptions(Object.values(saved).filter(Boolean).map(item=>item.team))} This week starts with the next slate that has yet to tip. TBD matchups appear as ESPN schedules them. ${canTrade?'Includes selected cuts and pickups.':tradeNote}</p>
  <div class="manager-impacts lineup-fit-grid">${cards.map(card=>`<section class="manager-impact lineup-fit-card">${card}</section>`).join('')}</div>`;
}

function renderLineupTargets(selected,rank){
 const {weeks,project}=currentHorizon();
 const status=$('#target-status'),results=$('#target-results');
 const button=$('#rank-lineup-targets');
 button.disabled=true;
 $('#target-week').textContent=lineupDateLabel(weeks[0].dates,weeks.at(-1).dates);
 results.innerHTML='';
 lineupTargets=[];
 const {team:teamA}=rosterScope('a','trade'),{team:teamB}=rosterScope('b','trade');
 if(!teamA||!teamB||teamA===teamB){status.textContent='Choose two different saved teams above.';return;}
 if(mixedLeagueSelection()){status.textContent='Choose two teams from the same league.';return;}
 if(!project){status.textContent=lineupScheduleStatus();return;}
 const regular={
  a:rosterPlayers(teamA),
  b:rosterPlayers(teamB)
 };
 const pool=key=>regular[key].filter(player=>player.nba&&(!selected[key].length||candidates[key].has(player.id)));
 const available=(key,opponent)=>{
  const owned=new Set([...opponent.players,...opponent.injured,...(opponent.unassigned||[])].map(playerKey));
  return pool(key).filter(player=>!owned.has(playerKey(player.name)));
 };
 const outgoing=available('a',teamB),targets=available('b',teamA);
 const key=JSON.stringify([regular.a,regular.b,outgoing,targets].map(group=>group.map(player=>player.id)));
 const coverage=weeks.filter(week=>week.covered).length;
 const scope=coverage===lineupWeekCount?'five weeks':`${coverage} weeks with schedule coverage`;
 if(!outgoing.length||!targets.length){status.textContent='Choose regular-roster players on both sides to rank swaps.';return;}
 button.disabled=false;
 if(rank)targetRanking={key,project,results:rankLineupTargets(project,regular,outgoing,targets,weights).slice(0,6)};
 if(targetRanking?.key!==key||targetRanking.project!==project){
  status.textContent=`Find one-for-one swaps within 10% on season FP/game that help ${teamA.name} without costing ${teamB.name} starter FP across ${scope}.`;
  return;
 }
 lineupTargets=targetRanking.results;
 const missing=[...new Set([...project(regular.a).missing,...project(regular.b).missing])];
 status.textContent=`One-for-one swaps within 10% on season FP/game across ${scope}. ${lineupAssumptions([teamA,teamB])}`;
 if(missing.length)status.insertAdjacentHTML('beforeend',` Partial estimate. Missing projection data for ${missing.map(namedPlayerBadge).join(', ')}.`);
 if(!lineupTargets.length)status.append(' No swaps improve your lineup while preserving the other team’s projected points.');
 results.innerHTML=lineupTargets.map(({target,send,gain,opponentGain,balance,impact},index)=>{
  return `<article class="suggestion-offer">
   <header><h3>Receive ${nbaBadge(target.nba,target.name)}</h3><span class="sub">${format(balance.percentage)}% season FP/game gap</span></header>
   <p>Send ${nbaBadge(send.nba,send.name)}</p>
   <dl class="swap-impacts">${swapImpactDetails('a',target,send,gain,impact.a)}${swapImpactDetails('b',send,target,opponentGain,impact.b)}</dl>
   <button class="button" type="button" data-load-target="${index}">Review lineup</button>
  </article>`;
 }).join('');
}

function swapImpactDetails(key,received,sent,gain,{incomingStarts,outgoingStarts,otherStarterDelta,bestDay,starterShift}){
 const starts=count=>`${count} projected start${count===1?'':'s'}`;
 const peak=bestDay?` Biggest lift is <strong>${shortDate.format(slateDate(bestDay.date))} ET</strong> <strong class="fp-gain">(${signed(bestDay.gain)} lineup FP)</strong>${bestDay.slot?` with the incoming player at ${bestDay.slot}`:''}.`:'';
 const shift=starterShift?`, with ${playerBadge(starterShift.player)} getting ${Math.abs(starterShift.starts)} ${starterShift.starts>0?'more':'fewer'} start${Math.abs(starterShift.starts)===1?'':'s'}`:'';
 const reshuffle=otherStarterDelta?` Other starters ${otherStarterDelta>0?'gain':'lose'} ${format(Math.abs(otherStarterDelta))} FP overall${shift}.`:'';
 return `<div><dt>${feedbackManager(key)} <strong class="${tone(gain)}">${signed(gain)} starter FP</strong></dt>
  <dd>${playerBadge(received)} gets <strong>${starts(incomingStarts)}</strong> vs. ${outgoingStarts} for ${playerBadge(sent)}.${peak}${reshuffle}</dd></div>`;
}

const plannerPanel=$('#roster-tools-panel');
const streamForm=$('#streamer-form'),returnForm=$('#return-form');
const toolManager=$('#roster-tools-manager');
const field=(form,name)=>form.elements.namedItem(name);
const rounded=value=>Math.round(value*100)/100;
const pointsGain=value=>`<strong class="${tone(value)}">${signed(rounded(value))} FP</strong>`;
const listBadges=players=>players.map(playerBadge).join(' ');

function toolRosters(){
 return Object.fromEntries(['a','b'].map(key=>{
  const saved=rosterBook?.getTeam(key);
  if(!saved)return [key,null];
  const {team,config}=saved;
  return [key,{team,config,active:rosterPlayers(team),injured:rosterPlayers({players:team.injured}),regular:config.regular,il:config.il}];
 }));
}

function toolSelect(select,players,label){
 const prior=select.value;
 select.replaceChildren(new Option(label,''),...players.map(player=>new Option(player.name,player.id)));
 select.value=[...select.options].some(option=>option.value===prior)?prior:'';
}

function renderRosterTools(){
 const {weeks}=currentHorizon(),side=toolRosters()[toolManager.value];
 const dates=weeks.flatMap(week=>week.remaining);
 const from=dates[0],through=dates.at(-1);
 for(const [form,name] of [[streamForm,'from'],[streamForm,'through'],[returnForm,'from']]){
  const input=field(form,name);
  input.min=from||'';
  input.max=through||'';
  if(from&&(!input.value||input.value<from||input.value>through))input.value=name==='through'?(weeks.find(week=>week.remaining.length)?.remaining.at(-1)||through):from;
 }
 for(const key of ['a','b'])toolManager.querySelector(`option[value="${key}"]`).textContent=rosterBook?.getTeam(key)?.team.name||manager(key);
 const ready=Boolean(side&&dataset&&outlookData&&!side.team.unassigned?.length);
 $('#roster-tools-note').textContent=!side?'Choose a saved team above.':side.team.unassigned?.length?'Resolve unconfirmed roster slots in a saved copy first.':!ready?'Loading the schedule and player stats…':'One pickup per comparison. Availability is based on the saved roster snapshot. Check Yahoo for waiver timing.';
 toolSelect(field(streamForm,'drop'),side?.active||[],side?.active.length>=side?.regular?'Choose a drop':'Use open roster spot');
 const adds=field(streamForm,'adds');
 adds.max=side?.config.id?'4':'99';
 if(Number(adds.value)>Number(adds.max))adds.value=adds.max;
 toolSelect(field(returnForm,'drop'),side?.active||[],side?.active.length>=side?.regular?'Choose a drop':'Use open roster spot');
 toolSelect(field(returnForm,'player'),side?.injured||[],'Choose an IL player');
 for(const button of streamForm.querySelectorAll('button'))button.disabled=!ready;
 returnForm.querySelector('button').disabled=!ready||!side.injured.length;
 $('#find-counters').disabled=!ready;
 for(const id of ['streamer','counter','return']){
  $(`#${id}-status`).textContent='';
  $(`#${id}-results`).replaceChildren();
 }
 counterResults=[];
}

function offerRoster(teams,key){
 const {offer,adjustments}=plannerState||{};
 if(!offer?.a.length||!offer?.b.length||!teams.a||!teams.b||mixedLeagueSelection()||teams.a.team===teams.b.team||teams.a.team.unassigned?.length||teams.b.team.unassigned?.length)return null;
 const incomingIL=offer[other(key)].filter(player=>teams[other(key)].injured.some(member=>member.id===player.id)).length;
 if(roster[key].ilIn>incomingIL)return null;
 return tradedRoster(teams,offer,key,adjustments?.[key].players);
}

toolManager.addEventListener('change',renderRosterTools);
streamForm.addEventListener('submit',event=>{
 event.preventDefault();
 const status=$('#streamer-status'),results=$('#streamer-results');
 results.replaceChildren();
 const form=new FormData(streamForm),key=toolManager.value;
 const teams=toolRosters(),side=teams[key];
 const from=form.get('from'),through=form.get('through'),drop=form.get('drop');
 if(!side)return;
 if(from>through){status.textContent='Choose an end date on or after the start date.';return;}
 const dates=currentHorizon().weeks.flatMap(week=>week.remaining).filter(date=>date>=from&&date<=through);
 const project=dates.length?lineupWeek(outlookData,weights,dates):null;
 if(!project){status.textContent='Schedule coverage is incomplete for these dates.';return;}
 const adds=Number(form.get('adds')),compare=event.submitter?.value==='compare';
 if(!adds&&!compare){status.textContent='This plan needs one available add.';return;}
 if(adds&&!drop&&side.active.length>=side.regular){status.textContent='Choose a player to drop from the full roster.';return;}
 const {players}=dataset;
 const free=players.filter(savedRosterFilter(side.config,side.team,'pickup'));
 const baseline=project(side.active);
 const ranked=adds?rankStreamers(project,side.active,free,drop).slice(0,6):[];
 const missing=baseline.missing.length?` Missing projections for ${baseline.missing.map(namedPlayerBadge).join(', ')}.`:'';
 const pending=currentHorizon().weeks.some(week=>week.tbd&&week.remaining.some(date=>dates.includes(date)));
 status.innerHTML=`Baseline ${format(baseline.points)} starter FP.${pending?' Some matchups are still TBD.':''}${missing}`;
 if(compare){
  const traded=offerRoster(teams,key);
  const best=ranked[0];
  const trade=traded?project(traded.active):null;
  const stream=!adds?'No adds left.':best?`Add ${playerBadge(best.player)} · ${pointsGain(best.gain)}`:'No available pickup improves the lineup.';
  results.innerHTML=`<dl class="swap-impacts"><div><dt>Proposed trade</dt><dd>${trade?pointsGain(trade.points-baseline.points):'Choose both saved teams, set the trade, and resolve any roster cuts.'}</dd></div><div><dt>Best single waiver add</dt><dd>${stream}</dd></div></dl>`;
 }else if(ranked.length){
  results.innerHTML=`<div class="suggestion-results">${ranked.map(row=>`<article class="suggestion-offer"><header><h3>${playerBadge(row.player)}</h3>${pointsGain(row.gain)}</header><p class="sub">${row.starts.length} projected starts · ${row.starts.map(date=>shortDate.format(slateDate(date))).join(', ')}</p></article>`).join('')}</div>`;
 }else status.append(' No pickup adds starter points in this window.');
 colorNumbers(plannerPanel);
});

$('#find-counters').addEventListener('click',()=>{
 const output=$('#counter-results'),status=$('#counter-status'),teams=toolRosters();
 counterResults=[];
 output.replaceChildren();
 const {offer}=plannerState||{};
 if(!teams.a||!teams.b||teams.a.team===teams.b.team||mixedLeagueSelection()||!offer?.a.length||!offer?.b.length||teams.a.team.unassigned?.length||teams.b.team.unassigned?.length){
  status.textContent='Choose two saved teams from one league and build an offer above with confirmed roster slots.';
  return;
 }
 const {project,weeks}=currentHorizon();
 if(!project){status.textContent=lineupScheduleStatus();return;}
 counterResults=counteroffers(project,teams,offer,weights).slice(0,6);
 status.textContent=counterResults.length?`Each counter is closer on season FP/game. Cuts use the lowest season FP/game among eligible incumbents.${weeks.some(week=>!week.covered||week.tbd)?' Projections use the available scheduled games.':''}`:'No one-player change produces a closer offer within the 10% gap.';
 output.innerHTML=counterResults.map(({proposal,balance,gains,rosters},index)=>`<article class="suggestion-offer"><header><strong>${format(balance.percentage)}% season FP/game gap</strong><button class="button" type="button" data-counter="${index}">Load counteroffer</button></header>
  <dl class="swap-impacts">${['a','b'].map(key=>`<div><dt>${feedbackManager(key)} ${pointsGain(gains[key])}</dt><dd>Sends ${listBadges(proposal[key])}${rosters[key].cuts.length?`<br>Suggested cuts ${listBadges(rosters[key].cuts)}`:''}</dd></div>`).join('')}</dl></article>`).join('');
 colorNumbers(plannerPanel);
});

$('#counter-results').addEventListener('click',event=>{
 const button=event.target.closest('[data-counter]');
 const counter=button&&counterResults[Number(button.dataset.counter)];
 if(!counter)return;
 const teams=toolRosters();
 for(const key of ['a','b']){
  picks[key]=counter.proposal[key].map(player=>player.id);
  const ilIn=counter.proposal[other(key)].filter(player=>teams[other(key)].injured.some(member=>member.id===player.id)).length;
  Object.assign(roster[key],{ilOut:0,ilIn,mode:counter.rosters[key].cuts.length?'Cut':'Pickup',players:counter.rosters[key].cuts.map(player=>player.id)});
 }
 selectTradeTab($('#hub-tab'));
 renderTrade();
 $('#hub-tab').focus();
});

returnForm.addEventListener('submit',event=>{
 event.preventDefault();
 const status=$('#return-status'),results=$('#return-results');
 results.replaceChildren();
 const form=new FormData(returnForm),key=toolManager.value,teams=toolRosters(),side=teams[key];
 const player=side?.injured.find(player=>player.id===form.get('player'));
 const drop=form.get('drop'),from=form.get('from'),scale=Number(form.get('scale'))/100;
 const {project,weeks}=currentHorizon();
 if(!project){status.textContent=lineupScheduleStatus();return;}
 if(!player){status.textContent='Choose an IL player.';return;}
 if(!drop&&side.active.length>=side.regular){status.textContent='Choose a drop to open a regular spot on the return date.';return;}
 if(!weeks.some(week=>week.covered&&week.remaining.some(date=>date>=from))){status.textContent='There are no covered dates from that return date.';return;}
 const baseline=project(side.active),trade=offerRoster(teams,key);
 const score=(roster,value,projectDrop)=>{
  const forecast=project([...roster,player],{player:player.id,from,drop:projectDrop,scale:value});
  return forecast.missing.includes(player.name)?null:forecast.points;
 };
 const tradedBase=trade?project(trade.active).points:null;
 const keepsPlayer=trade?.injured.some(member=>member.id===player.id);
 const staysFull=trade?.active.length>=side.regular&&!trade.active.some(member=>member.id===drop);
 const tradedScore=value=>!trade?null:!keepsPlayer?tradedBase:staysFull?null:score(trade.active,value,drop);
 const rows=[['Stays on IL',baseline.points,tradedBase],['Full production',score(side.active,1,drop),tradedScore(1)],
  [`Limited to ${format(scale*100)}%`,score(side.active,scale,drop),tradedScore(scale)]];
 status.innerHTML=`${playerBadge(player)} · Return ${shortDate.format(slateDate(from))} ET. Limited production scales season FP/game.${weeks.some(week=>!week.covered||week.tbd)?' Uses available scheduled games.':''}`;
 if(trade&&keepsPlayer&&staysFull)status.append(' Choose a player who stays on the roster after the trade to open a spot.');
 results.innerHTML=`<div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Scenario</th><th>Keep roster FP</th><th>Make trade FP</th><th>Trade gain</th></tr></thead><tbody>${rows.map(([label,keep,traded])=>`<tr><th scope="row">${label}</th><td>${format(keep)}</td><td>${format(traded)}</td><td>${keep===null||traded===null?'—':pointsGain(traded-keep)}</td></tr>`).join('')}</tbody></table></div>`;
 colorNumbers(plannerPanel);
});

function weekComparison(incoming,offset){
 if(!outlookData)return null;
 const dates=easternWeek(offset);
 return {dates,a:weeklyPackage(incoming.a,outlookData,weights,dates),b:weeklyPackage(incoming.b,outlookData,weights,dates)};
}

function renderWeekly(incoming){
 const target=$('#trade-weekly');
 if(!incoming.a.length||!incoming.b.length){target.innerHTML='';return;}
 const comparison=weekComparison(incoming,weeklyOffset);
 if(!comparison){
  target.innerHTML=`<section class="trade-subsection"><h3>Weekly comparison</h3><p class="sub">${outlookFailed?'Schedule unavailable.':'Loading NBA schedule…'}</p></section>`;
  return;
 }
 const {dates,a,b}=comparison;
 const margin=a.total!==null&&b.total!==null?a.total-b.total:null;
 const leader=margin>0?'a':'b';
 const feedback=margin===null?'Full-week totals are unavailable for one or both sides.':Math.abs(margin)<.005?'Even on the weekly projection.':`${feedbackManager(leader)} gains <strong class="fp-gain">${format(Math.abs(margin))} projected FP</strong> for the week.`;
 const cell=({games,points,covered=true})=>`<td class="num">${covered?games:'—'}</td><td class="num"><b class="trade-fp">${format(covered?points:null)}</b></td>`;
 const rows=dates.map((date,index)=>`<tr><th scope="row">${weekdayDate.format(slateDate(date))}</th>${cell(a.daily[index])}${cell(b.daily[index])}</tr>`).join('');
 target.innerHTML=`<section class="trade-subsection"><div class="weekly-heading"><h3>Incoming player schedule</h3><select id="trade-week-offset" aria-label="Comparison week">${Array.from({length:lineupWeekCount},(_,index)=>`<option value="${index}" ${weeklyOffset===index?'selected':''}>${index===0?'This week':weekName(index)}</option>`).join('')}</select></div><p class="sub">${shortDate.format(slateDate(dates[0]))}–${shortDate.format(slateDate(dates[6]))} ET · Monday–Sunday Eastern, typically Tuesday–Monday Manila.</p><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th scope="col" rowspan="2">NBA slate (ET)</th><th class="num" colspan="2" scope="colgroup">${managerLabel('a')} receives</th><th class="num" colspan="2" scope="colgroup">${managerLabel('b')} receives</th></tr><tr><th scope="col" class="num">Player-games</th><th scope="col" class="num">Proj. FP</th><th scope="col" class="num">Player-games</th><th scope="col" class="num">Proj. FP</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">Week total</th>${cell({games:a.games,points:a.total})}${cell({games:b.games,points:b.total})}</tr></tfoot></table></div><p class="weekly-feedback">${feedback}</p><p class="sub">Season FP per game × scheduled games for the players received. Includes all scheduled games for the incoming players. See Lineup Fit for starting-slot limits and remaining slates. ${a.covered?'':'Schedule coverage is incomplete for this week.'}</p></section>`;
}

$('#trade-weekly').addEventListener('change',event=>{
 if(event.target.id!=='trade-week-offset'||!chatTrade)return;
 weeklyOffset=Number(event.target.value);
 renderWeekly(chatTrade.incoming);
 colorNumbers($('#trade-weekly'));
 $('#trade-week-offset').focus();
});

function outlookTable(players){
 const title='<h3>Next five opponents</h3>';
 if(!outlookData)return `<section class="trade-subsection">${title}<p class="sub">${outlookFailed?'NBA schedule unavailable.':'Loading NBA schedule…'}</p></section>`;
 const blocks=players.map(player=>{
  const rows=nextOpponents(player,outlookData,weights).map(({date,home,opponent,defense,meeting,points})=>`<tr><td>${esc(tipoff.format(new Date(date)))}</td><th scope="row">${home?'vs':'@'} ${nbaBadge(opponent)}</th><td class="num">${format(defense?.pointsAllowed??null)}${defense?`<small class="sub form-coverage">${defense.games} games</small>`:''}</td><td class="num">${format(defense?.pointsPer100??null)}</td><td>${meeting?`${esc(meeting.date)}${meeting.minutes?` · ${esc(meeting.minutes)} MIN`:''}`:'—'}</td><td class="num"><b class="trade-fp">${format(points)}</b></td></tr>`);
  return `<details class="outlook-player" ${players.length<=2?'open':''}><summary>${nbaBadge(player.nba,player.name)}</summary>${rows.length?`<div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Tipoff (Manila)</th><th>Opponent</th><th class="num">PTS allowed / game</th><th class="num">PTS allowed / 100 poss.</th><th>Last meeting (NBA date)</th><th class="num">Last meeting FP</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<p class="sub">No upcoming games in the current feed.</p>'}</details>`;
 }).join('');
 return `<section class="trade-subsection">${title}${blocks}<p class="sub">Defense uses recent regular-season finals from <a href="https://www.espn.com/nba/scoreboard" target="_blank" rel="noopener noreferrer">ESPN</a>. The per-100 figure uses estimated possessions and needs at least five box scores. Last meeting uses available RotoWire regular-season logs and your scoring settings.</p></section>`;
}

function renderSummary(balance,risks,scenarios,incoming){
 const result=$('#trade-summary-result');
 if(!balance)result.textContent='Season FP edge unavailable.';
 else if(!balance.leader)result.textContent='Even on season FP per game.';
 else result.innerHTML=`${edgeLabel[balance.level]} ${feedbackManager(balance.leader)} · <strong class="fp-gain">+${format(balance.gap)} FP/game</strong>`;

 const flagged=Object.values(risks).flatMap(risk=>risk.entries.filter(entry=>entry.atRisk));
 const names=flagged.slice(0,2).map(({player,injury})=>`${playerBadge(player)} (${esc(injury.status)})`);
 $('#trade-summary-flags').innerHTML=flagged.length?`${names.join(', ')}${flagged.length>2?` +${flagged.length-2} more`:''}`:injuryData?'No availability flags in the current feed.':'Injury report unavailable.';

 const edge=(comparison,unit)=>comparison?.leader?`${feedbackManager(comparison.leader)} <strong class="fp-gain">+${format(comparison.gap)} ${unit}</strong>`:comparison?'Even':'Unavailable';
 const floor=tradeBalance(scenarios?.a?.floor,scenarios?.b?.floor);
 const ceiling=tradeBalance(scenarios?.a?.ceiling,scenarios?.b?.ceiling);
 $('#trade-summary-range').innerHTML=`<span>Floor · ${edge(floor,'FP/game')}</span><span>Ceiling · ${edge(ceiling,'FP/game')}</span>`;
 const week=weekComparison(incoming,1);
 $('#trade-summary-week').innerHTML=week?edge(tradeBalance(week.a.total,week.b.total),'projected FP'):'Unavailable';

 const availability=injuryHistoryData&&[...incoming.a,...incoming.b].map(player=>({player,sample:historicalAvailability(player,injuryHistoryData.players[player.id],injuryHistoryData.currentSeason,weights)}))
  .filter(({sample})=>sample?.rate!=null).sort((a,b)=>b.sample.missed-a.sample.missed);
 const highest=availability?.[0];
 $('#trade-summary-history').innerHTML=highest?.sample.missed?`${playerBadge(highest.player)} had ${highest.sample.missed} documented injury absences in the completed seasons covered.`:highest?'No documented injury absences in the samples available.':'Insufficient injury history.';
}

function renderContext(selected,totals,balance,rosterResults){
 const section=$('#trade-context');
 const a=selected.a.length,b=selected.b.length;
 const version=JSON.stringify([picks.a,picks.b,weights,managerNames,roster]);
 if(version!==chatVersion){$('#trade-chat-log').textContent='';chatVersion=version;}
 $('#trade-assistant').hidden=$('#trade-summary').hidden=!a||!b;
 $('#desk-empty').hidden=Boolean(a&&b);
 $('#breakdown-empty').hidden=Boolean(a||b);
 section.hidden=!a&&!b;
 if(section.hidden){chatTrade=null;return;}
 const incoming={a:selected.b,b:selected.a};
 const risks={a:tradeContext(incoming.a,injuryData?.players,weights),b:tradeContext(incoming.b,injuryData?.players,weights)};
 const scenarios=a&&b?{a:packageScenarios(incoming.a,weights),b:packageScenarios(incoming.b,weights)}:null;
 if(a&&b)renderSummary(balance,risks,scenarios,incoming);
 const rosterSummary=$('#trade-summary-roster-row');
 rosterSummary.hidden=!rosterResults||!Object.values(rosterResults).some(row=>row.players.length);
 if(!rosterSummary.hidden)$('#trade-summary-roster').innerHTML=['a','b'].map(key=>`${feedbackManager(key)} <strong class="${tone(rosterResults[key].net)}">${signed(rosterResults[key].net)} FP/game</strong>${rosterResults[key].spots.cuts&&rosterResults[key].remaining?' before remaining cuts':''}`).join(' · ');
 const formRows=a&&b?[5,10,15].map(window=>({
  window,a:packageForm(incoming.a,weights,window),b:packageForm(incoming.b,weights,window)
 })):[];
 chatTrade={incoming,selected,risks,scenarios,totals,formRows,rosterResults};
 const scenarioPanel=$('#trade-scenarios');
 scenarioPanel.innerHTML=a&&b?scenarioTable(scenarios,totals):'';
 for(const marker of scenarioPanel.querySelectorAll('[data-position]')){
  marker.style.left=`${marker.dataset.position}%`;
 }
 $('#trade-analysis').innerHTML=a&&b?analysisNotes(selected,totals,risks,formRows):'';
 renderWeekly(incoming);
 $('#trade-outlook').innerHTML=outlookTable([...selected.a,...selected.b]);
 $('#trade-injury-history').innerHTML=injuryHistoryTable(incoming);
 $('#trade-risk-sides').innerHTML=['a','b'].filter(key=>incoming[key].length).map(key=>{
  const context=risks[key];
  const {flagged,flaggedPoints,entries}=context;
  const summary=flagged?`${flagged} out or at risk of missing time${flaggedPoints===null?'':` · ${format(flaggedPoints)} FP / game`}`:
   injuryData?'No availability flags in the current feed.':'Injury report unavailable.';
  const details=entries.map(({player,injury,smallSample})=>{
   const status=injury?.status?`${esc(injury.status)}${injury.gameDate?` · ${esc(injury.gameDate)} NBA slate`:''}`:'';
   const note=injury?.noteUrl?`<a href="${esc(injury.noteUrl)}" target="_blank" rel="noopener noreferrer">${esc(injury.noteArea)} update</a> · ${esc(injury.noteDate)}`:
    injury?.injury?esc(injury.injury):'';
   const sample=smallSample?(player.games>0?`Only ${player.games} GP`:'No season sample in this data'):'';
   return `<li><strong>${playerBadge(player)}</strong><div class="sub">${[status,note,sample].filter(Boolean).join(' · ')}</div></li>`;
  }).join('');
  return `<section class="trade-risk-side"><h3 class="manager-${key}-text">${managerLabel(key)} receives</h3><p class="sub risk-summary">${summary}</p>${details?`<ul>${details}</ul>`:''}</section>`;
 }).join('');
 const gap=Math.abs(a-b);
 $('#trade-roster-note').textContent=a&&b&&gap?
  `Roster spots: ${manager(a>b?'b':'a')} receives ${gap} extra player${gap===1?'':'s'}. If their roster is full, compare the player${gap===1?'':'s'} they’d cut with what the other manager could add off waivers.`:'';
 const checked=injuryData?new Date(injuryData.updatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
 $('#trade-injury-source').innerHTML=injuryData?
  `<a href="${esc(injuryData.lineupsUrl)}" target="_blank" rel="noopener noreferrer">RotoWire lineups</a> and <a href="${esc(injuryData.reportUrl)}" target="_blank" rel="noopener noreferrer">injury reports</a> · checked ${esc(checked)} Manila time. Check the latest report before accepting.`:'';
}

function scenarioTable(scenarios,totals){
 const rows=[['Floor','floor'],['Season average','average'],['Ceiling','ceiling']];
 const table=rows.map(([label,key])=>{
  const a=key==='average'?totals.b:scenarios.a?.[key]??null;
  const b=key==='average'?totals.a:scenarios.b?.[key]??null;
  return `<tr><th scope="row">${label}</th><td class="num"><b class="trade-fp">${format(a)}</b></td><td class="num"><b class="trade-fp">${format(b)}</b></td></tr>`;
 }).join('');
 const scales=[['Floor','floor'],['Ceiling','ceiling']].map(([label,key])=>scenarioScale(label,tradeBalance(scenarios.a?.[key],scenarios.b?.[key]))).join('');
 return `<section class="trade-subsection"><h3>Scoring range</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Scenario</th><th class="num">${managerLabel('a')} receives</th><th class="num">${managerLabel('b')} receives</th></tr></thead><tbody>${table}</tbody></table></div><div class="scenario-scales">${scales}</div><p class="sub">FP per game. Floor and ceiling add up each player’s low or high game-log estimates. At least five complete games per player are needed.</p></section>`;
}

function scenarioScale(label,balance){
 if(!balance)return `<section class="scenario-scale"><h4>${label} balance</h4><p class="sub">Not enough games to compare.</p></section>`;
 const edge=balance.leader?`${managerLabel(balance.leader)} <strong class="fp-gain">+${format(balance.gap)} FP / game</strong> (${format(balance.percentage)}%)`:'Even';
 return `<section class="scenario-scale"><h4>${label} balance</h4><div class="balance-scale" aria-hidden="true"><div class="balance-labels"><span class="manager-a-text">${managerLabel('a')}</span><span>Even</span><span class="manager-b-text">${managerLabel('b')}</span></div><div class="balance-track"><span class="balance-marker" data-position="${balance.position}"></span></div></div><p class="sub">${edge}</p></section>`;
}

function gamesPlayedTable(selected){
 const rows=['a','b'].flatMap(key=>selected[key==='a'?'b':'a'].map(player=>({key,player})));
 const years=[...new Set(rows.flatMap(({player})=>Object.keys(player.history||{})))].sort();
 if(!years.length)return '';
 const heading=year=>`${year}–${String(Number(year)+1).slice(-2)}`;
 return `<section class="trade-subsection"><h3>Games played by season</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Player</th><th>Goes to</th>${years.map(year=>`<th class="num">${heading(year)}</th>`).join('')}<th class="num">This season</th></tr></thead><tbody>${rows.map(({key,player})=>`<tr><th scope="row">${playerBadge(player)}</th><td class="manager-${key}-text">${managerLabel(key)}</td>${years.map(year=>`<td class="num">${player.history?.[year]??'—'}</td>`).join('')}<td class="num">${player.games??'—'}</td></tr>`).join('')}</tbody></table></div><p class="sub">Games played measures availability. It doesn’t tell us why someone missed time.</p></section>`;
}

function formTable(rows){
 const totalCell=(sample,window)=>sample?`<b class="trade-fp">${format(sample.points)}</b>${sample.shortest<window?`<small class="sub form-coverage">Shortest sample: ${sample.shortest}/${window}</small>`:''}`:'—';
 return `<section class="trade-subsection"><h3>Recent form</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Games</th><th class="num">${managerLabel('a')} receives</th><th class="num">${managerLabel('b')} receives</th><th class="num">${managerLabel('a')} net</th><th class="num">${managerLabel('b')} net</th></tr></thead><tbody>${rows.map(({window,a,b})=>{
  const changes=managerChanges(b?.points??null,a?.points??null);
  return `<tr><th scope="row">Last ${window}</th><td class="num">${totalCell(a,window)}</td><td class="num">${totalCell(b,window)}</td><td class="num"><b class="net-pill ${tone(changes.a.net)}">${signed(changes.a.net)}</b></td><td class="num"><b class="net-pill ${tone(changes.b.net)}">${signed(changes.b.net)}</b></td></tr>`;
 }).join('')}</tbody></table></div><p class="sub">FP per game from each player’s latest appearances this season. A shorter sample is labeled. A dash means at least one player had no complete games in the window.</p></section>`;
}

function driversTable(selected,rows){
 const windows=[{label:'Season',changes:statSwings(selected.a,selected.b,weights)},...rows.map(({window,a,b})=>({
  label:`Last ${window}`,
  partial:!!(a&&b&&(a.shortest<window||b.shortest<window)),
  changes:a&&b?statSwings(b.averages,a.averages,weights):null
 }))];
 const gains=(changes,direction)=>{
  if(!changes)return '—';
  const notable=changes.filter(({points})=>points*direction>0).slice(0,3);
  return notable.length?`<div class="driver-stats">${notable.map(({stat,points})=>statPill(stat,signed(points*direction),'driver-gain')).join('')}</div>`:'—';
 };
 return `<section class="trade-subsection"><h3>What moves the score</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Games</th><th>${managerLabel('a')}’s biggest gains</th><th>${managerLabel('b')}’s biggest gains</th></tr></thead><tbody>${windows.map(({label,changes,partial})=>`<tr><th scope="row">${label}${partial?'<small class="sub form-coverage">Partial sample</small>':''}</th><td>${gains(changes,1)}</td><td>${gains(changes,-1)}</td></tr>`).join('')}</tbody></table></div><p class="sub">Each number is the stat’s contribution to FP per game under your rules. A gain for one manager is the other manager’s loss.</p></section>`;
}

function analysisNotes(selected,totals,risks,formRows){
 const notes=[];
 if(Number.isFinite(totals.a)&&Number.isFinite(totals.b)){
  if((risks.a.flagged||risks.b.flagged)&&risks.a.flaggedPoints!==null&&risks.b.flaggedPoints!==null){
   const a=totals.b-risks.a.flaggedPoints,b=totals.a-risks.b.flaggedPoints;
   notes.push(['If flagged players sit',`${feedbackManager('a')}’s package would be worth ${format(a)} FP / game and ${feedbackManager('b')}’s ${format(b)} before any replacements.`]);
  }
 }
 return formTable(formRows)+driversTable(selected,formRows)+gamesPlayedTable(selected)+(notes.length?`<div class="trade-insights">${notes.map(([heading,body])=>`<article class="trade-insight"><h3>${heading}</h3><p>${body}</p></article>`).join('')}</div>`:'');
}

function tradeAnswer(question){
 const {incoming,totals,risks,scenarios,selected,formRows,rosterResults}=chatTrade;
 const q=question.toLowerCase();
 const requestedWindow=Number(q.match(/\blast\s+(5|10|15)\b/)?.[1])||null;
 const recent=formRows.find(row=>row.window===(requestedWindow??5));
 const chosen=[...incoming.a,...incoming.b].filter(player=>playerKey(question).includes(player.id));
 const comparison=(a,b)=>{
  const result=tradeBalance(a,b);
  if(!result)return 'Some players are missing the stats needed for this comparison.';
  const verdict=result.leader?`${manager(result.leader)} leads by ${format(result.gap)} FP per game.`:'The packages are even.';
  return `${manager('a')} receives ${format(a)} FP per game and ${manager('b')} receives ${format(b)}. ${verdict}`;
 };
 if(/\b(weekly|this week|next week|which week)\b/.test(q)){
  const week=weekComparison(incoming,/\bthis week\b/.test(q)?0:1);
  if(!week||week.a.total===null||week.b.total===null)return 'Full-week totals are unavailable for one or both sides.';
  const margin=week.a.total-week.b.total;
  return `${manager('a')} projects for ${format(week.a.total)} FP over ${week.a.games} player-games.\n${manager('b')} projects for ${format(week.b.total)} FP over ${week.b.games}.\n${Math.abs(margin)<.005?'Even on the weekly projection.':`${manager(margin>0?'a':'b')} leads by ${format(Math.abs(margin))} FP.`} Assumes everyone plays their listed games.`;
 }
 if(/\b(opponents?|schedule|next (five|5))\b/.test(q)){
  if(!outlookData)return 'The NBA schedule is currently unavailable.';
  const players=chosen.length?chosen:[...incoming.a,...incoming.b];
  return players.slice(0,4).map(player=>{
   const opponents=nextOpponents(player,outlookData,weights).map(game=>`${game.home?'vs':'at'} ${game.opponent}`);
   return opponents.length?`${player.name}: ${opponents.join(', ')}.`:`No upcoming games in the feed for ${player.name}.`;
  }).join('\n')+'\nSee Next five opponents for defense and last meetings.';
 }
 if(/\b(floor|ceiling|quartile|variance|range|upside)\b/.test(q)){
  if(!scenarios.a||!scenarios.b)return 'Every player needs five complete season games before both packages can be compared at the floor and ceiling.';
  return `Floor: ${comparison(scenarios.a.floor,scenarios.b.floor)}\nCeiling: ${comparison(scenarios.a.ceiling,scenarios.b.ceiling)}\nPlayers can hit their highs and lows on different nights.`;
 }
 if(/injur|\brisk\b|\bhealthy\b|\bmiss\b|\bsit\b/.test(q)){
  if(/history|historical|past|recurr|durability/.test(q)){
   if(!injuryHistoryData)return 'The historical injury feed is unavailable.';
   const players=chosen.length?chosen:[...incoming.a,...incoming.b];
   return players.map(player=>{
    const record=injuryHistoryData.players[player.id];
    const sample=historicalAvailability(player,record,injuryHistoryData.currentSeason,weights);
    if(!sample)return `Injury history unavailable for ${player.name}.`;
    const area=record.areas[0];
    return `${player.name}: ${sample.missed} documented injury absences over ${sample.games} played or injury-missed games in the covered completed seasons.${area?` ${area.area} was the most reported area (${area.games} games in the available history).`:''}${sample.adjusted===null?'':` Historical availability scenario: ${format(sample.adjusted)} FP per game.`}`;
   }).join('\n');
  }
  if(!injuryData)return 'The injury feed is unavailable. The season FP comparison doesn’t account for missed games.';
  const entries=['a','b'].map(key=>{
   const items=risks[key].entries.filter(entry=>entry.injury?.status&&(chosen.length===0||chosen.includes(entry.player)));
   return items.length?`${manager(key)} receives ${items.map(({player,injury})=>`${player.name} (${injury.status}${injury.gameDate?` for the ${injury.gameDate} slate`:''})`).join(', ')}.`:`No reported status for the players checked on ${manager(key)}’s return.`;
  });
  return entries.join('\n')+'\nAvailability is unconfirmed for players without a status.';
 }
 if(/games.*play|play.*games|durability|availability|histor/.test(q)){
  if(chosen.length===1){
   const p=chosen[0];
   const records=Object.entries(p.history||{}).map(([year,games])=>`${year}–${String(Number(year)+1).slice(-2)}: ${games}`);
   const season=p.games==null?'Season games played are unavailable.':`${p.name} has played ${p.games} games this season.`;
   return records.length?`${season} Completed seasons: ${records.join(', ')}.`:season;
  }
  const anchor=players=>players.slice().sort((a,b)=>(fp(b)??-Infinity)-(fp(a)??-Infinity))[0];
  const a=chosen.length>=2?chosen[0]:anchor(incoming.a),b=chosen.length>=2?chosen[1]:anchor(incoming.b);
  const history=compareGamesPlayed(a,b);
  if(!history)return 'There are no shared completed seasons in the data for those players. See the games-played table for their available records.';
  return `Over ${history.gameTotals.length} shared completed season(s), ${a.name} averaged ${format(history.avgA)} games played and ${b.name} averaged ${format(history.avgB)}. Games played can reflect injuries, rest, and other absences.`;
 }
 if(/stats?|drive|\bwhy\b|categor/.test(q)){
  if(requestedWindow&&(!recent.a||!recent.b))return 'At least one player is missing complete game stats for that window.';
  const changes=(requestedWindow?statSwings(recent.b.averages,recent.a.averages,weights):statSwings(selected.a,selected.b,weights)).slice(0,3);
  return changes.length?`${requestedWindow?`Last ${requestedWindow} (using available games): `:''}${manager('a')}’s biggest changes are ${changes.map(({stat,points})=>`${boxFields[stat]} ${signed(points)} FP`).join(', ')} per game. ${manager('b')} gets the opposite changes.`:'No weighted stat difference is available for these packages.';
 }
 if(requestedWindow||/recent|form|last five|trend/.test(q)){
  if(!recent.a||!recent.b)return 'At least one player is missing complete game stats for that window.';
  const shortest=Math.min(recent.a.shortest,recent.b.shortest);
  return `Last ${recent.window}: ${comparison(recent.a.points,recent.b.points)}${shortest<recent.window?` The shortest player sample was ${shortest} games.`:''}`;
 }
 if(/roster|waiver|stream|\bcut\b|\bdrop\b|slot|break[ -]even|pick.?up/.test(q)){
  return ['a','b'].map(key=>{
   const {net,remaining,breakEven,spots}=rosterResults[key];
   const result=`${manager(key)}: ${net===null?'adjusted FP unavailable':`${signed(net)} FP per game`}.`;
   if(spots.cuts&&remaining)return `${result} ${remaining} required cut${remaining===1?'':'s'} still to select.`;
   if(breakEven!==null&&breakEven>0)return `${result} Needs ${format(breakEven)} FP per game from ${remaining} open slot${remaining===1?'':'s'} to break even.`;
   return result;
  }).join('\n');
 }
 if(/fair|even|balance|\bwin|\bwins\b|\bleads?\b|\bnet\b|fleece|worth|accept|better|should.*take/.test(q)){
  const result=tradeBalance(totals.b,totals.a);
  if(!result)return comparison(totals.b,totals.a);
  const label={fair:'Balanced on season averages',edge:'An edge on season averages',lopsided:'A large gap on season averages'}[result.level];
  return `${label} (${format(result.percentage)}%).\n${comparison(totals.b,totals.a)}`;
 }
 if(chosen.length===1){
  const player=chosen[0],points=fp(player);
  return `${player.name} has ${points===null?'no complete FP average':`${format(points)} FP per game`} under your settings${player.games>0?` across ${player.games} games`:''}. Ask about injuries, recent form, or games played for more context.`;
 }
 return 'Ask about fairness, floor and ceiling, recent form, injury history, weekly points, stat drivers, or roster spots.';
}

function askTrade(question){
 if(!question||!chatTrade?.incoming.a.length||!chatTrade.incoming.b.length)return;
 const players=new Map([...chatTrade.incoming.a,...chatTrade.incoming.b].map(player=>[player.name.toLowerCase(),player]));
 const names=[...players.keys()].sort((a,b)=>b.length-a.length)
  .map(name=>name.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&'));
 const mentions=new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`,'giu');
 const colorMentions=text=>{
  let html='',offset=0;
  for(const match of text.matchAll(mentions)){
   html+=esc(text.slice(offset,match.index))+nbaBadge(players.get(match[0].toLowerCase())?.nba,match[0]);
   offset=match.index+match[0].length;
  }
  return html+esc(text.slice(offset));
 };
 const turns=$('#trade-chat-log');
 const turn=document.createElement('article');
 turn.className='chat-turn';
 const prompt=document.createElement('p');
 prompt.className='chat-question';
 prompt.innerHTML=colorMentions(question);
 const answer=document.createElement('div');
 answer.className='chat-answer';
 for(const text of tradeAnswer(question).split('\n')){
  const paragraph=document.createElement('p');
  paragraph.innerHTML=colorMentions(text);
  answer.append(paragraph);
 }
 turn.append(prompt,answer);
 turns.append(turn);
 colorNumbers(turn);
 if(turns.childElementCount>8)turns.firstElementChild.remove();
 turns.scrollTop=turns.scrollHeight;
}
$('#trade-questions').addEventListener('click',event=>askTrade(event.target.closest('[data-question]')?.dataset.question));
$('#trade-ask').addEventListener('submit',event=>{
 event.preventDefault();
 const input=$('#trade-question');
 askTrade(input.value.trim());
 input.value='';
});

async function loadPlayers(){
 if(dataset)return dataset;
 if(!dataRequest)dataRequest=fetch('./trade-data.json?v=small-balls').then(async response=>{
  if(!response.ok)throw new Error('Player data unavailable');
  const data=await response.json();
  if(!data.players?.length)throw new Error('Empty player data');
  dataset=data;
  playersByName=new Map(data.players.map(player=>[playerKey(player.name),player]));
  rosterBook.setInjuryEstimates(data.players,injuryData);
  if(weights)currentRanks=seasonRanks(data.players,weights);
  const asOf=new Date(data.updatedAt).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'});
  $('#trade-sources').innerHTML=`<a href="${esc(data.statsUrl)}" target="_blank" rel="noopener noreferrer">RotoWire season stats</a> · checked ${esc(asOf)} · <a href="${esc(data.rankUrl)}" target="_blank" rel="noopener noreferrer">Draft ranks</a> (${esc(data.rankDate)})`;
  colorNumbers($('#trade-sources'));
  return data;
 }).catch(()=>{
  dataRequest=null;
  $('#trade-sources').textContent='Could not load RotoWire player data.';
  return null;
 });
 return dataRequest;
}

function renderPicker(){
 const results=$('#picker-results');
 const status=$('#picker-status');
 if(!dataset){status.textContent='Player data unavailable. Close the picker and try again.';results.innerHTML='';return;}
 const query=playerKey(search.value);
 const browsing=pickerPurpose==='browse';
 const suggesting=pickerPurpose==='suggestion';
 const entry=pickerPurpose==='draft'||suggesting?draftPicker:null;
 const action=pickerPurpose==='roster'?(spotsFor(side).cuts?'cut':'pickup'):browsing?'pickup':'trade';
 const {config,team,allows}=browsing?{config:pickerLeague,allows:savedRosterFilter(pickerLeague,null,'pickup')}:entry?{allows:entry.allows||(()=>true)}:rosterScope(side,action);
 const matches=dataset.players.filter(allows).map(player=>({player,match:pickerMatch(player,query)})).filter(row=>row.match);
 const nameOrder=(a,b)=>a.name.localeCompare(b.name);
 const byRank=(a,b,getRank)=>(getRank(a)??Infinity)-(getRank(b)??Infinity)||nameOrder(a,b);
 const order=sort.value==='draft'?(a,b)=>byRank(a,b,player=>player.rank):sort.value==='name'?nameOrder:(a,b)=>byRank(a,b,seasonRank);
 matches.sort((a,b)=>b.match-a.match||order(a.player,b.player));
 const players=matches.map(row=>row.player);
 const notes=[];
 if(entry)notes.push(`${entry.remaining()} ${suggesting?'more you can mark':'open spots'} · Select players, then click Done.`);
 else if(action==='pickup')notes.push(config?`Excludes rostered players across ${config.teams.length} saved team${config.teams.length===1?'':'s'} in ${config.name}.`:'Check pickup availability in your league.');
 else if(team)notes.push(action==='cut'?`Regular roster for ${team.name}.`:`Regular roster and IL for ${team.name}.`);
 else notes.push(`Season rank uses your FP per game rules across ${currentRanks.size} players with stats.`);
 if(players.length>100)notes.push(`Showing 100 of ${players.length}. Search to narrow the list.`);
 if(!players.length)notes.push('No matching players with a profile in the trade tool.');
 status.textContent=notes.join(' ');
 results.innerHTML=players.slice(0,100).map(player=>{
  const points=fp(player);
  const selected=entry?entry.rostered(player):!browsing&&pickerOccupied(player.id);
  const full=entry?.remaining()===0;
  const lead=sort.value==='draft'?rankText(player.rank):rankText(seasonRank(player));
  const selectionLabel=suggesting?'Marked':entry?'On roster':'Added';
  const limitLabel=suggesting?'Mark limit reached':'Roster full';
  const cells=`<span>${lead}</span><span><strong>${playerBadge(player)}</strong><span class="sub">${nbaBadge(player.nba)} ${esc(player.position)} · ${rankSummary(player)}</span></span><span class="${!selected&&!full&&points!==null?'trade-fp':''}">${selected?selectionLabel:full?limitLabel:points===null?(weights?'No stats':''):`${format(points)} FP`}</span>`;
  return browsing?`<div class="picker-row">${cells}</div>`:`<button class="picker-row" type="button" data-player-id="${esc(player.id)}" ${selected||full||suggesting&&points===null?'disabled':''}>${cells}</button>`;
 }).join('');
 colorNumbers(results);
 colorNumbers(status);
}

async function openPicker(title){
 $('#picker-title').textContent=title;
 colorNumbers($('#picker-title'));
 search.value='';
 const close=$('#close-player-picker');
 const multiple=pickerPurpose==='draft'||pickerPurpose==='suggestion';
 close.textContent=multiple?'Done':'×';
 close.setAttribute('aria-label',multiple?'Done adding players':'Close player picker');
 $('#picker-status').textContent='Loading players…';
 $('#picker-results').innerHTML='';
 picker.showModal();
 search.focus();
 await loadPlayers();
 if(picker.open)renderPicker();
}

board.addEventListener('click',event=>{
 const add=event.target.closest('[data-pick], [data-roster-pick]');
 const remove=event.target.closest('[data-remove], [data-roster-remove]');
 if(remove){
  const key=remove.dataset.side;
  const list=remove.dataset.rosterRemove?roster[key].players:picks[key];
  const index=list.indexOf(remove.dataset.remove||remove.dataset.rosterRemove);
  if(index>=0)list.splice(index,1);
  renderTrade();
  return;
 }
 if(!add)return;
 pickerPurpose=add.dataset.rosterPick?'roster':'trade';
 side=add.dataset.pick||add.dataset.rosterPick;
 const action=pickerPurpose==='trade'?'Add outgoing player':spotsFor(side).cuts?'Choose a cut':'Choose a pickup';
 openPicker(`${action} for ${manager(side)}`);
});
search.addEventListener('input',renderPicker);
sort.addEventListener('change',renderPicker);
$('#picker-results').addEventListener('click',event=>{
 const button=event.target.closest('[data-player-id]');
 if(!button||button.disabled)return;
 if(pickerPurpose==='draft'||pickerPurpose==='suggestion'){
  const player=dataset.players.find(player=>player.id===button.dataset.playerId);
  if(!player)return;
  draftPicker.add(player);
  renderPicker();
  search.focus();
  search.select();
  return;
 }
 if(pickerOccupied(button.dataset.playerId))return;
 const target=pickerPurpose==='roster'?roster[side].players:picks[side];
 const {cuts,pickups}=spotsFor(side);
 if(pickerPurpose==='roster'&&target.length>=(cuts||pickups))return;
 target.push(button.dataset.playerId);
 picker.close();
 renderTrade();
});

rosterBook=setupRosterBook((config,key)=>{
 if(config){roster.regular=config.regular;roster.il=config.il;}
 if(key&&!config)Object.assign(roster[key],{open:0,ilOut:0,ilIn:0});
 const otherConfig=key&&rosterBook.getTeam(other(key))?.config;
 if(config?.scoring&&weightsPreset&&weightsPreset!==config.id&&(!otherConfig||otherConfig.id===config.id)){
  enableLeague(config,false);
  return;
 }
 if(weights)renderTrade();
},config=>{
 pickerLeague=config;
 pickerPurpose='browse';
 if(!weights)sort.value='draft';
 openPicker(`Free agents · ${config.name}`);
},entry=>{
 draftPicker=entry;
 pickerPurpose='draft';
 if(!weights)sort.value='draft';
 openPicker(entry.title);
},async()=>{
 const [data]=await Promise.all([loadPlayers(),loadInjuries()]);
 return data;
});

if(sharedTrade){
 activateTrade(false);
 loadPlayers().then(data=>{
  restoring=false;
  if(!data){shareStatus.textContent='Could not load the players in this trade link.';return;}
  const known=new Map(data.players.flatMap(player=>[[player.id,player.id],[sharedPlayerRef(player),player.id]]));
  const used=new Set();
  for(const key of ['a','b']){
   const valid=[];
   for(const ref of picks[key]){
    const id=known.get(ref);
    if(id&&!used.has(id)){used.add(id);valid.push(id);}
   }
   if(valid.length!==picks[key].length)shareStatus.textContent='Some players in this link are unavailable.';
   picks[key]=valid;
  }
  for(const key of ['a','b']){
   const state=roster[key];
   const mapped=[...new Set(state.players.map(ref=>known.get(ref)).filter(id=>id&&!used.has(id)))];
   if(mapped.length!==state.players.length)shareStatus.textContent='Some players in this link are unavailable.';
   state.players=mapped;
  }
  renderTrade();
 });
}else if(isTradeHash(location.hash)){
 $('#trade-link-error').hidden=false;
}else if(requestedLeague===bigBalls.id){
 enableLeague(bigBalls,false);
}else if(requestedLeague===smallBalls.id){
 enableLeague(smallBalls,false);
}
