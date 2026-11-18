import {nbaBadge,playerKey} from './public-ui.mjs';
import {boxFields,scoringWeights,tradePoints,seasonRanks,tradeBalance,tradeContext,managerChanges,recentPackagePoints,compareGamesPlayed,statSwings} from './trade-model.mjs';

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
 const winner=leader&&manager(leader),other=leader&&manager(leader==='A'?'B':'A');
 if(!winner)verdict.textContent='Dead even. Nobody gets bragging rights.';
 else if(level==='fair')verdict.textContent=`Fair deal on paper. ${winner} gets the small edge.`;
 else if(level==='edge')verdict.textContent=`${winner} got the better end of the deal.`;
 else verdict.textContent=`${winner} is trying to fleece ${other}!`;
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
 section.hidden=!a&&!b;
 if(section.hidden)return;
 const incoming={a:selected.b,b:selected.a};
 const risks={a:tradeContext(incoming.a,injuryData?.players,weights),b:tradeContext(incoming.b,injuryData?.players,weights)};
 $('#trade-analysis').innerHTML=a&&b?analysisNotes(selected,totals,risks):'';
 $('#trade-risk-sides').innerHTML=['a','b'].filter(key=>incoming[key].length).map(key=>{
  const context=risks[key];
  const {flagged,flaggedPoints,entries}=context;
  const summary=flagged?`${flagged} with uncertain availability${flaggedPoints===null?'':` · ${format(flaggedPoints)} FP / game from those players`}`:
   injuryData?'No out, doubtful, or questionable flags found.':'Injury data unavailable.';
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

function analysisNotes(selected,totals,risks){
 const notes=[];
 const best=players=>players.filter(player=>fp(player)!==null).sort((a,b)=>fp(b)-fp(a))[0]||players[0];
 const playerA=best(selected.b),playerB=best(selected.a);
 const availability=compareGamesPlayed(playerA,playerB);
 if(availability){
  const {gameTotals,avgA,avgB}=availability;
  const yearLabel=year=>`${year}–${String(Number(year)+1).slice(-2)}`;
  const years=gameTotals.map(row=>yearLabel(row.year)).join(', ');
  const edge=Math.abs(avgA-avgB)>=5?` ${esc(avgA>avgB?playerA.name:playerB.name)} played ${format(Math.abs(avgA-avgB))} more games per season on average.`:'';
  notes.push(`<strong>Games played.</strong> In ${years}, ${esc(playerA.name)} (to Manager A) played ${gameTotals.map(row=>row.a).join(' / ')} games and ${esc(playerB.name)} (to Manager B) played ${gameTotals.map(row=>row.b).join(' / ')}.${edge} Games missed can include injuries, rest, or other absences.`);
 }
 const recentA=recentPackagePoints(selected.a,weights),recentB=recentPackagePoints(selected.b,weights);
 if(recentA!==null&&recentB!==null){
  const gap=Number((recentB-recentA).toFixed(2));
  const before=managerChanges(totals.a,totals.b).a.net;
  const reversal=before!==null&&gap*before<0?' The recent sample flips the season-average edge.':'';
  notes.push(`<strong>Recent form.</strong> Using up to five games per player, Manager A nets <b class="${tone(gap)}">${signed(gap)} FP / game</b> and Manager B nets <b class="${tone(-gap)}">${signed(-gap)} FP / game</b>.${reversal}`);
 }
 if(Number.isFinite(totals.a)&&Number.isFinite(totals.b)){
  const changes=statSwings(selected.a,selected.b,weights);
  const swings=changes.slice(0,3).map(({stat,points})=>`${boxFields[stat]} <b class="${tone(points)}">${signed(points)} FP</b>`).join(' · ');
  if(swings)notes.push(`<strong>What moves the score.</strong> Manager A’s biggest gains or losses per game: ${swings}. Manager B gets the inverse.`);
  if((risks.a.flagged||risks.b.flagged)&&risks.a.flaggedPoints!==null&&risks.b.flaggedPoints!==null){
   const a=totals.b-risks.a.flaggedPoints,b=totals.a-risks.b.flaggedPoints;
   notes.push(`<strong>If the flagged players sit.</strong> The incoming packages would be worth ${format(a)} FP / game for Manager A and ${format(b)} for Manager B before any replacement players.`);
  }
 }
 return notes.length?`<ul>${notes.map(note=>`<li>${note}</li>`).join('')}</ul>`:'';
}

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
