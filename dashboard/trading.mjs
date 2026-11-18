import {nbaBadge,playerKey} from './public-ui.mjs';
import {boxFields,scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,compareGamesPlayed,statSwings,packageScenarios,packageForm} from './trade-model.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const format=value=>value===null?'—':number.format(value);
const signed=value=>value===null?'—':`${value>0?'+':''}${format(value)}`;
const tone=value=>value>0?'fp-gain':value<0?'fp-loss':'';
const manager=key=>`Manager ${key.toUpperCase()}`;
const form=$('#scoring-form');
const input=name=>form.elements.namedItem(name);
const settings=$('#trade-settings');
const board=$('#trade-board');
const picker=$('#player-picker');
const search=$('#picker-search');
const sort=$('#picker-sort');
const picks={a:[],b:[]};
const settingsKey='real-balliggas-trade-weights';
let weights,side='a',dataset,dataRequest;
let currentRanks=new Map();
let injuryData,injuryRequest;
let chatTrade,chatVersion='';
let totalRebound='';

try {
 const saved=JSON.parse(localStorage.getItem(settingsKey)||'null');
 if(saved){
  for(const key of Object.keys(boxFields))input(key).value=saved[key]??'';
  input('split').checked=saved.split===true;
 }
} catch {}

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

form.addEventListener('submit',event=>{
 event.preventDefault();
 const values=Object.fromEntries(Object.keys(boxFields).map(key=>[key,input(key).value]));
 const split=input('split').checked;
 weights=scoringWeights(values,split);
 if(!weights)return;
 if(dataset)currentRanks=seasonRanks(dataset.players,weights);
 input('to').value=weights.to;
 try {localStorage.setItem(settingsKey,JSON.stringify({...values,reb:split?totalRebound:values.reb,to:weights.to,split}));} catch {}
 settings.hidden=true;
 board.hidden=false;
 renderTrade();
 loadPlayers();
 loadInjuries();
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
 renderTrade();
});

function playerStats(player){
 const keys=input('split').checked?Object.keys(boxFields):['pts','reb','ast','st','blk','to'];
 return keys.map(key=>`<span>${boxFields[key]} ${format(player.stats?.[key]??null)}</span>`).join('');
}
const rankText=rank=>rank==null?'—':`#${rank}`;
const seasonRank=player=>currentRanks.get(player.id);
const rankSummary=player=>`Season ${rankText(seasonRank(player))} · Draft ${rankText(player.rank)}${player.games>0?` · ${player.games} GP`:''}`;
const fp=player=>tradePoints(player.stats,weights);
const occupied=id=>picks.a.includes(id)||picks.b.includes(id);

function renderTrade(){
 const totals={};
 const selected={};
 for(const key of ['a','b']){
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
   return `<article class="trade-card"><h3>${nbaBadge(player.nba,player.name)}</h3><button class="button" type="button" data-remove="${esc(player.id)}" data-side="${key}" aria-label="Remove ${esc(player.name)}">×</button><span class="sub">${esc(player.position)} · ${rankSummary(player)}${profile}</span><strong>${points===null?'No score':`${format(points)} FP / game`}</strong><div class="trade-stats sub">${playerStats(player)}</div></article>`;
  }).join(''):'<p class="trade-empty sub">No players selected.</p>';
 }
 renderBalance(totals);
 renderContext(selected,totals);
}

function renderBalance(totals){
 const panel=$('#trade-balance');
 panel.hidden=!picks.a.length||!picks.b.length;
 if(panel.hidden)return;
 const scale=$('#trade-scale'),verdict=$('#trade-verdict'),delta=$('#trade-delta');
 const changes=managerChanges(totals.a,totals.b);
 $('#manager-impacts').innerHTML=Object.entries(changes).map(([key,{incoming,outgoing,net}])=>`<section class="manager-impact"><h3 class="manager-${key}-text">${manager(key)}</h3><strong class="manager-net ${tone(net)}">${signed(net)} FP</strong><span class="sub">Net per game</span><dl><div><dt>Receives</dt><dd>${format(incoming)} FP</dd></div><div><dt>Sends</dt><dd>${format(outgoing)} FP</dd></div></dl></section>`).join('');
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
 else if(level==='fair')verdict.textContent=`Balanced · small edge for ${winner}`;
 else if(level==='edge')verdict.textContent=`Edge for ${winner}`;
 else verdict.textContent=`Big edge for ${winner}`;
 delta.textContent=winner?`${winner} gains ${format(gap)} FP / game on season averages. The packages are ${format(percentage)}% apart.`:'Both packages have the same FP per game.';
 scale.setAttribute('aria-label',`${verdict.textContent}. ${delta.textContent}`);
 $('#balance-marker').style.left=`${position}%`;
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

function renderContext(selected,totals){
 const section=$('#trade-context');
 const a=selected.a.length,b=selected.b.length;
 const version=JSON.stringify([picks.a,picks.b,weights]);
 if(version!==chatVersion){$('#trade-chat-log').textContent='';chatVersion=version;}
 $('#trade-assistant').hidden=!a||!b;
 section.hidden=!a&&!b;
 if(section.hidden){chatTrade=null;return;}
 const incoming={a:selected.b,b:selected.a};
 const risks={a:tradeContext(incoming.a,injuryData?.players,weights),b:tradeContext(incoming.b,injuryData?.players,weights)};
 const scenarios=a&&b?{a:packageScenarios(incoming.a,weights),b:packageScenarios(incoming.b,weights)}:null;
 const formRows=a&&b?[5,10,15].map(window=>({
  window,a:packageForm(incoming.a,weights,window),b:packageForm(incoming.b,weights,window)
 })):[];
 chatTrade={incoming,selected,risks,scenarios,totals,formRows};
 const scenarioPanel=$('#trade-scenarios');
 scenarioPanel.innerHTML=a&&b?scenarioTable(scenarios,totals):'';
 for(const marker of scenarioPanel.querySelectorAll('[data-position]')){
  marker.style.left=`${marker.dataset.position}%`;
 }
 $('#trade-analysis').innerHTML=a&&b?analysisNotes(selected,totals,risks,formRows):'';
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
  return `<section class="trade-risk-side"><h3 class="manager-${key}-text">${manager(key)} receives</h3><p class="sub risk-summary">${summary}</p>${details?`<ul>${details}</ul>`:''}</section>`;
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
  return `<tr><th scope="row">${label}</th><td class="num">${format(a)}</td><td class="num">${format(b)}</td></tr>`;
 }).join('');
 const scales=[['Floor','floor'],['Ceiling','ceiling']].map(([label,key])=>scenarioScale(label,tradeBalance(scenarios.a?.[key],scenarios.b?.[key]))).join('');
 return `<section class="trade-subsection"><h3>Scoring range</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Scenario</th><th class="num">Manager A receives</th><th class="num">Manager B receives</th></tr></thead><tbody>${table}</tbody></table></div><div class="scenario-scales">${scales}</div><p class="sub">FP per game. Floor and ceiling add up each player’s low or high game-log estimates. At least five complete games per player are needed.</p></section>`;
}

function scenarioScale(label,balance){
 if(!balance)return `<section class="scenario-scale"><h4>${label} balance</h4><p class="sub">Not enough games to compare.</p></section>`;
 const edge=balance.leader?`${manager(balance.leader)} +${format(balance.gap)} FP / game (${format(balance.percentage)}%)`:'Even';
 return `<section class="scenario-scale"><h4>${label} balance</h4><div class="balance-scale" aria-hidden="true"><div class="balance-labels"><span class="manager-a-text">Manager A</span><span>Even</span><span class="manager-b-text">Manager B</span></div><div class="balance-track"><span class="balance-marker" data-position="${balance.position}"></span></div></div><p class="sub">${edge}</p></section>`;
}

function gamesPlayedTable(selected){
 const rows=['a','b'].flatMap(key=>selected[key==='a'?'b':'a'].map(player=>({key,player})));
 const years=[...new Set(rows.flatMap(({player})=>Object.keys(player.history||{})))].sort();
 if(!years.length)return '';
 const heading=year=>`${year}–${String(Number(year)+1).slice(-2)}`;
 return `<section class="trade-subsection"><h3>Games played by season</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Player</th><th>Goes to</th>${years.map(year=>`<th class="num">${heading(year)}</th>`).join('')}<th class="num">This season</th></tr></thead><tbody>${rows.map(({key,player})=>`<tr><th scope="row">${esc(player.name)}</th><td class="manager-${key}-text">${manager(key)}</td>${years.map(year=>`<td class="num">${player.history?.[year]??'—'}</td>`).join('')}<td class="num">${player.games??'—'}</td></tr>`).join('')}</tbody></table></div><p class="sub">Games played measures availability. It doesn’t tell us why someone missed time.</p></section>`;
}

function formTable(rows){
 const totalCell=(sample,window)=>sample?`${format(sample.points)}${sample.shortest<window?`<small class="sub form-coverage">Shortest sample: ${sample.shortest}/${window}</small>`:''}`:'—';
 return `<section class="trade-subsection"><h3>Recent form</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Games</th><th class="num">A receives</th><th class="num">B receives</th><th class="num">A net</th><th class="num">B net</th></tr></thead><tbody>${rows.map(({window,a,b})=>{
  const changes=managerChanges(b?.points??null,a?.points??null);
  return `<tr><th scope="row">Last ${window}</th><td class="num">${totalCell(a,window)}</td><td class="num">${totalCell(b,window)}</td><td class="num ${tone(changes.a.net)}">${signed(changes.a.net)}</td><td class="num ${tone(changes.b.net)}">${signed(changes.b.net)}</td></tr>`;
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
  return notable.length?`<div class="driver-stats">${notable.map(({stat,points})=>`<span>${boxFields[stat]} <b class="fp-gain">${signed(points*direction)}</b></span>`).join('')}</div>`:'—';
 };
 return `<section class="trade-subsection"><h3>What moves the score</h3><div class="table-wrap"><table class="trade-scenario-table"><thead><tr><th>Games</th><th>Manager A’s biggest gains</th><th>Manager B’s biggest gains</th></tr></thead><tbody>${windows.map(({label,changes,partial})=>`<tr><th scope="row">${label}${partial?'<small class="sub form-coverage">Partial sample</small>':''}</th><td>${gains(changes,1)}</td><td>${gains(changes,-1)}</td></tr>`).join('')}</tbody></table></div><p class="sub">Each number is the stat’s contribution to FP per game under your rules. A gain for one manager is the other manager’s loss.</p></section>`;
}

function analysisNotes(selected,totals,risks,formRows){
 const notes=[];
 if(Number.isFinite(totals.a)&&Number.isFinite(totals.b)){
  if((risks.a.flagged||risks.b.flagged)&&risks.a.flaggedPoints!==null&&risks.b.flaggedPoints!==null){
   const a=totals.b-risks.a.flaggedPoints,b=totals.a-risks.b.flaggedPoints;
   notes.push(['If flagged players sit',`Manager A’s package would be worth ${format(a)} FP / game and Manager B’s ${format(b)} before any replacements.`]);
  }
 }
 return formTable(formRows)+driversTable(selected,formRows)+gamesPlayedTable(selected)+(notes.length?`<div class="trade-insights">${notes.map(([heading,body])=>`<article class="trade-insight"><h3>${heading}</h3><p>${body}</p></article>`).join('')}</div>`:'');
}

function tradeAnswer(question){
 const {incoming,totals,risks,scenarios,selected,formRows}=chatTrade;
 const q=question.toLowerCase();
 const requestedWindow=Number(q.match(/\blast\s+(5|10|15)\b/)?.[1])||null;
 const recent=formRows.find(row=>row.window===(requestedWindow??5));
 const chosen=[...incoming.a,...incoming.b].filter(player=>playerKey(question).includes(player.id));
 const comparison=(a,b)=>{
  const result=tradeBalance(a,b);
  if(!result)return 'Some players are missing the stats needed for this comparison.';
  const verdict=result.leader?`${manager(result.leader)} leads by ${format(result.gap)} FP per game.`:'The packages are even.';
  return `Manager A receives ${format(a)} FP per game and Manager B receives ${format(b)}. ${verdict}`;
 };
 if(/\b(floor|ceiling|quartile|variance|range|upside)\b/.test(q)){
  if(!scenarios.a||!scenarios.b)return 'Every player needs five complete season games before both packages can be compared at the floor and ceiling.';
  return `Floor: ${comparison(scenarios.a.floor,scenarios.b.floor)} Ceiling: ${comparison(scenarios.a.ceiling,scenarios.b.ceiling)} These sum individual percentiles. Players can hit their highs and lows on different nights.`;
 }
 if(/injur|\brisk\b|\bhealthy\b|\bmiss\b|\bsit\b/.test(q)){
  if(!injuryData)return 'The injury feed is unavailable. The season FP comparison doesn’t account for missed games.';
  const entries=['a','b'].map(key=>{
   const items=risks[key].entries.filter(entry=>entry.injury?.status&&(chosen.length===0||chosen.includes(entry.player)));
   return items.length?`${manager(key)} receives ${items.map(({player,injury})=>`${player.name} (${injury.status}${injury.gameDate?` for the ${injury.gameDate} slate`:''})`).join(', ')}.`:`No reported status for the players checked on ${manager(key)}’s return.`;
  });
  return entries.join(' ')+' A missing status doesn’t confirm availability.';
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
  return changes.length?`${requestedWindow?`Last ${requestedWindow} (using available games): `:''}Manager A’s biggest changes are ${changes.map(({stat,points})=>`${boxFields[stat]} ${signed(points)} FP`).join(', ')} per game. Manager B gets the opposite changes.`:'No weighted stat difference is available for these packages.';
 }
 if(requestedWindow||/recent|form|last five|trend/.test(q)){
  if(!recent.a||!recent.b)return 'At least one player is missing complete game stats for that window.';
  const shortest=Math.min(recent.a.shortest,recent.b.shortest);
  return `Last ${recent.window}: ${comparison(recent.a.points,recent.b.points)}${shortest<recent.window?` The shortest player sample was ${shortest} games.`:''}`;
 }
 if(/roster|waiver|stream|\bcut\b|\bdrop\b|slot/.test(q)){
  const gap=incoming.a.length-incoming.b.length;
  return gap?`${manager(gap>0?'a':'b')} receives ${Math.abs(gap)} extra player(s) and may need to make room. The other manager may get an open spot. The tool doesn’t assume who gets cut or picked up.`:'Both managers receive the same number of players. The trade itself does not change roster size.';
 }
 if(/fair|even|balance|\bwin|\bwins\b|\bleads?\b|\bnet\b|fleece|worth|accept|better|should.*take/.test(q)){
  const result=tradeBalance(totals.b,totals.a);
  if(!result)return comparison(totals.b,totals.a);
  const label={fair:'Balanced on season averages',edge:'An edge on season averages',lopsided:'A large gap on season averages'}[result.level];
  return `${label} (${format(result.percentage)}%). ${comparison(totals.b,totals.a)} Check the floor, ceiling, and availability before deciding.`;
 }
 if(chosen.length===1){
  const player=chosen[0],points=fp(player);
  return `${player.name} has ${points===null?'no complete FP average':`${format(points)} FP per game`} under your settings${player.games>0?` across ${player.games} games`:''}. Ask about injuries, recent form, or games played for more context.`;
 }
 return 'I can compare fairness, floor and ceiling, recent form, injury risk, games played, stat drivers, and roster spots for this trade. Try one of those topics.';
}

function askTrade(question){
 if(!question||!chatTrade?.incoming.a.length||!chatTrade.incoming.b.length)return;
 const turns=$('#trade-chat-log');
 const turn=document.createElement('article');
 turn.className='chat-turn';
 for(const [className,text] of [['chat-question',question],['chat-answer',tradeAnswer(question)]]){
  const paragraph=document.createElement('p');
  paragraph.className=className;
  paragraph.textContent=text;
  turn.append(paragraph);
 }
 turns.append(turn);
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
  currentRanks=seasonRanks(data.players,weights);
  const asOf=new Date(data.updatedAt).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'});
  $('#trade-sources').innerHTML=`<a href="${esc(data.statsUrl)}" target="_blank" rel="noopener noreferrer">RotoWire season stats</a> · checked ${esc(asOf)} · <a href="${esc(data.rankUrl)}" target="_blank" rel="noopener noreferrer">Draft ranks</a> (${esc(data.rankDate)})`;
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
 const players=dataset.players.filter(player=>!query||playerKey(player.name).includes(query)||player.nba?.toLowerCase().includes(query));
 const nameOrder=(a,b)=>a.name.localeCompare(b.name);
 const byRank=(a,b,getRank)=>(getRank(a)??Infinity)-(getRank(b)??Infinity)||nameOrder(a,b);
 players.sort(sort.value==='draft'?(a,b)=>byRank(a,b,player=>player.rank):sort.value==='name'?nameOrder:(a,b)=>byRank(a,b,seasonRank));
 const notes=[`Season rank uses your FP per game rules across ${currentRanks.size} players with stats.`];
 if(players.length>100)notes.push(`Showing 100 of ${players.length}. Search to narrow the list.`);
 if(!players.length)notes.push('No matching players.');
 status.textContent=notes.join(' ');
 results.innerHTML=players.slice(0,100).map(player=>{
  const points=fp(player);
  const selected=occupied(player.id);
  const lead=sort.value==='draft'?rankText(player.rank):rankText(seasonRank(player));
  return `<button class="picker-row" type="button" data-player-id="${esc(player.id)}" ${selected?'disabled':''}><span>${lead}</span><span><strong>${esc(player.name)}</strong><span class="sub">${nbaBadge(player.nba)} ${esc(player.position)} · ${rankSummary(player)}</span></span><span>${selected?'Added':points===null?'No stats':`${format(points)} FP`}</span></button>`;
 }).join('');
}

board.addEventListener('click',async event=>{
 const add=event.target.closest('[data-pick]');
 const remove=event.target.closest('[data-remove]');
 if(remove){
  const list=picks[remove.dataset.side];
  const index=list.indexOf(remove.dataset.remove);
  if(index>=0)list.splice(index,1);
  renderTrade();
  return;
 }
 if(!add)return;
 side=add.dataset.pick;
 $('#picker-title').textContent=`Add outgoing player for ${manager(side)}`;
 search.value='';
 $('#picker-status').textContent='Loading players…';
 $('#picker-results').innerHTML='';
 picker.showModal();
 search.focus();
 await loadPlayers();
 if(picker.open)renderPicker();
});
search.addEventListener('input',renderPicker);
sort.addEventListener('change',renderPicker);
$('#picker-results').addEventListener('click',event=>{
 const button=event.target.closest('[data-player-id]');
 if(!button||button.disabled||occupied(button.dataset.playerId))return;
 picks[side].push(button.dataset.playerId);
 picker.close();
 renderTrade();
});
