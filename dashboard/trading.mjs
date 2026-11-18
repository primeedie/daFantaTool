import {nbaBadge,playerKey} from './public-ui.mjs';
import {setupRosterBook,savedRosterFilter} from './saved-rosters.mjs?v=roster-search';
import {boxFields,scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,compareGamesPlayed,statSwings,packageScenarios,packageForm,nextOpponents,easternWeek,weeklyPackage,historicalAvailability,parseSharedTrade,compactTradeHash,sharedPlayerRef,isTradeHash,defaultRoster,rosterSpots,rosterSettings,rosterAdjustment,pickerMatch} from './trade-model.mjs?v=roster-search';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
function selectTradeTab(active){
 for(const tab of tabs){
  const selected=tab===active;
  tab.setAttribute('aria-selected',String(selected));
  tab.tabIndex=selected?0:-1;
  document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected;
 }
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
const roster={...defaultRoster,a:{open:0,ilOut:0,ilIn:0,players:[]},b:{open:0,ilOut:0,ilIn:0,players:[]}};
const rosterPanel=$('#trade-roster');
const settingsKey='real-balliggas-trade-weights';
let weights,side='a',pickerPurpose='trade',pickerLeague,draftPicker,dataset,dataRequest,rosterBook;
let currentRanks=new Map();
let injuryData,injuryRequest;
let injuryHistoryData,historyRequest,historyFailed=false;
let outlookData,outlookRequest,outlookFailed=false;
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
 loadPlayers();
 loadInjuries();
 loadInjuryHistory();
 loadOutlook();
}
form.addEventListener('submit',event=>{
 event.preventDefault();
 activateTrade(true);
 $('#edit-scoring').focus();
});
$('#edit-scoring').addEventListener('click',()=>{
 board.hidden=true;
 settings.hidden=false;
 input('pts').focus();
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
 renderContext(selected,totals,balance,rosterResults);
 shareButton.disabled=!dataset||!(selected.a.length||selected.b.length);
 colorNumbers(board);
}

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
  if(savedTeam){
   state.open=Math.max(0,roster.regular-savedTeam.players.length);
   const injured=new Set(savedTeam.injured.map(playerKey));
   state.ilOut=selected[key].filter(player=>injured.has(playerKey(player.name))).length;
  }
  const options=rosterSettings(roster,state,outgoing,incoming);
  for(const name of ['open','ilOut','ilIn'])state[name]=options[name];
  const controls=rosterPanel.querySelector(`[data-roster-team="${key}"]`);
  controls.querySelector('legend').textContent=manager(key);
  const room=savedTeam?Math.max(0,roster.il-savedTeam.injured.length+state.ilOut):roster.il;
  const maxima={open:roster.regular,ilOut:Math.min(outgoing,roster.il),ilIn:Math.min(incoming,roster.il,room)};
  state.ilIn=Math.min(state.ilIn,maxima.ilIn);
  for(const field of controls.querySelectorAll('[data-roster-option]')){
   field.max=maxima[field.dataset.rosterOption];
   field.value=state[field.dataset.rosterOption];
   field.disabled=Boolean(savedTeam)&&field.dataset.rosterOption!=='ilIn';
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
  return `<section class="manager-impact"><h3 class="manager-${key}-text">${managerLabel(key)}</h3><strong class="manager-net ${tone(result.net)}">${signed(result.net)} FP</strong><div class="sub">${status}</div><p class="sub">${detail}</p>${playerRows?`<div class="roster-actions">${playerRows}</div>`:''}${action}${breakEven}</section>`;
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
  renderTrade();
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
  const name=record?`<a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">${esc(player.name)}</a>`:esc(player.name);
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
 outlookRequest=fetch('./trade-outlook.json').then(async response=>{
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
 target.innerHTML=`<section class="trade-subsection"><div class="weekly-heading"><h3>Weekly comparison</h3><select id="trade-week-offset" aria-label="Comparison week"><option value="0" ${weeklyOffset===0?'selected':''}>This week</option><option value="1" ${weeklyOffset===1?'selected':''}>Next week</option></select></div><p class="sub">${shortDate.format(slateDate(dates[0]))}–${shortDate.format(slateDate(dates[6]))} ET · Monday–Sunday Eastern, typically Tuesday–Monday Manila.</p><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th scope="col" rowspan="2">NBA slate (ET)</th><th class="num" colspan="2" scope="colgroup">${managerLabel('a')} receives</th><th class="num" colspan="2" scope="colgroup">${managerLabel('b')} receives</th></tr><tr><th scope="col" class="num">Player-games</th><th scope="col" class="num">Proj. FP</th><th scope="col" class="num">Player-games</th><th scope="col" class="num">Proj. FP</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">Week total</th>${cell({games:a.games,points:a.total})}${cell({games:b.games,points:b.total})}</tr></tfoot></table></div><p class="weekly-feedback">${feedback}</p><p class="sub">Season FP per game × scheduled games for the players received. Assumes each player plays every listed game, including earlier slates in this week’s comparison. ${a.covered?'':'Schedule coverage is incomplete for this week.'}</p></section>`;
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
 const names=flagged.slice(0,2).map(({player,injury})=>`${player.name} (${injury.status})`);
 $('#trade-summary-flags').textContent=flagged.length?`${names.join(', ')}${flagged.length>2?` +${flagged.length-2} more`:''}`:injuryData?'No availability flags in the current feed.':'Injury report unavailable.';

 const edge=(comparison,unit)=>comparison?.leader?`${feedbackManager(comparison.leader)} <strong class="fp-gain">+${format(comparison.gap)} ${unit}</strong>`:comparison?'Even':'Unavailable';
 const floor=tradeBalance(scenarios?.a?.floor,scenarios?.b?.floor);
 const ceiling=tradeBalance(scenarios?.a?.ceiling,scenarios?.b?.ceiling);
 $('#trade-summary-range').innerHTML=`<span>Floor · ${edge(floor,'FP/game')}</span><span>Ceiling · ${edge(ceiling,'FP/game')}</span>`;
 const week=weekComparison(incoming,1);
 $('#trade-summary-week').innerHTML=week?edge(tradeBalance(week.a.total,week.b.total),'projected FP'):'Unavailable';

 const availability=injuryHistoryData&&[...incoming.a,...incoming.b].map(player=>({player,sample:historicalAvailability(player,injuryHistoryData.players[player.id],injuryHistoryData.currentSeason,weights)}))
  .filter(({sample})=>sample?.rate!=null).sort((a,b)=>b.sample.missed-a.sample.missed);
 const highest=availability?.[0];
 $('#trade-summary-history').textContent=highest?.sample.missed?`${highest.player.name} had ${highest.sample.missed} documented injury absences in the completed seasons covered.`:highest?'No documented injury absences in the samples available.':'Insufficient injury history.';
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
   return `<li><strong>${esc(player.name)}</strong><div class="sub">${[status,note,sample].filter(Boolean).join(' · ')}</div></li>`;
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
 return `<section class="trade-subsection"><h3>Games played by season</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Player</th><th>Goes to</th>${years.map(year=>`<th class="num">${heading(year)}</th>`).join('')}<th class="num">This season</th></tr></thead><tbody>${rows.map(({key,player})=>`<tr><th scope="row">${esc(player.name)}</th><td class="manager-${key}-text">${managerLabel(key)}</td>${years.map(year=>`<td class="num">${player.history?.[year]??'—'}</td>`).join('')}<td class="num">${player.games??'—'}</td></tr>`).join('')}</tbody></table></div><p class="sub">Games played measures availability. It doesn’t tell us why someone missed time.</p></section>`;
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
 const turns=$('#trade-chat-log');
 const turn=document.createElement('article');
 turn.className='chat-turn';
 const prompt=document.createElement('p');
 prompt.className='chat-question';
 prompt.textContent=question;
 const answer=document.createElement('div');
 answer.className='chat-answer';
 for(const text of tradeAnswer(question).split('\n')){
  const paragraph=document.createElement('p');
  paragraph.textContent=text;
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
 if(!dataRequest)dataRequest=fetch('./trade-data.json').then(async response=>{
  if(!response.ok)throw new Error('Player data unavailable');
  const data=await response.json();
  if(!data.players?.length)throw new Error('Empty player data');
  dataset=data;
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
 const entry=pickerPurpose==='draft'?draftPicker:null;
 const action=pickerPurpose==='roster'?(spotsFor(side).cuts?'cut':'pickup'):browsing?'pickup':'trade';
 const {config,team,allows}=browsing?{config:pickerLeague,allows:savedRosterFilter(pickerLeague,null,'pickup')}:entry?{allows:()=>true}:rosterScope(side,action);
 const matches=dataset.players.filter(allows).map(player=>({player,match:pickerMatch(player,query)})).filter(row=>row.match);
 const nameOrder=(a,b)=>a.name.localeCompare(b.name);
 const byRank=(a,b,getRank)=>(getRank(a)??Infinity)-(getRank(b)??Infinity)||nameOrder(a,b);
 const order=sort.value==='draft'?(a,b)=>byRank(a,b,player=>player.rank):sort.value==='name'?nameOrder:(a,b)=>byRank(a,b,seasonRank);
 matches.sort((a,b)=>b.match-a.match||order(a.player,b.player));
 const players=matches.map(row=>row.player);
 const notes=[];
 if(entry)notes.push(`${entry.remaining()} open spots · Select players, then click Done.`);
 else if(action==='pickup')notes.push(config?`Excludes regular and IL players across ${config.teams.length} saved team${config.teams.length===1?'':'s'} in ${config.name}.`:'Check pickup availability in your league.');
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
  const cells=`<span>${lead}</span><span><strong>${esc(player.name)}</strong><span class="sub">${nbaBadge(player.nba)} ${esc(player.position)} · ${rankSummary(player)}</span></span><span class="${!selected&&!full&&points!==null?'trade-fp':''}">${selected?(entry?'On roster':'Added'):full?'Roster full':points===null?(weights?'No stats':''):`${format(points)} FP`}</span>`;
  return browsing?`<div class="picker-row">${cells}</div>`:`<button class="picker-row" type="button" data-player-id="${esc(player.id)}" ${selected||full?'disabled':''}>${cells}</button>`;
 }).join('');
 colorNumbers(results);
 colorNumbers(status);
}

async function openPicker(title){
 $('#picker-title').textContent=title;
 colorNumbers($('#picker-title'));
 search.value='';
 const close=$('#close-player-picker');
 close.textContent=pickerPurpose==='draft'?'Done':'×';
 close.setAttribute('aria-label',pickerPurpose==='draft'?'Done adding roster players':'Close player picker');
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
 if(pickerPurpose==='draft'){
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
}
