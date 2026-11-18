import {nbaBadge,playerKey} from './public-ui.mjs';
import {boxFields,scoringWeights,tradePoints,seasonRanks,tradeBalance} from './trade-model.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const format=value=>value===null?'—':number.format(value);
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
 for(const key of ['a','b']){
  const players=picks[key].map(id=>dataset?.players.find(player=>player.id===id)).filter(Boolean);
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
}

function renderBalance(totals){
 const panel=$('#trade-balance');
 panel.hidden=!picks.a.length||!picks.b.length;
 if(panel.hidden)return;
 const scale=$('#trade-scale'),verdict=$('#trade-verdict'),delta=$('#trade-delta');
 const balance=tradeBalance(totals.a,totals.b);
 scale.hidden=!balance;
 if(!balance){
  verdict.textContent='Not enough stats';
  delta.textContent='A comparison needs stats for every selected player.';
  return;
 }
 const {gap,percentage,level,leader,position}=balance;
 verdict.textContent=level==='fair'?'Fair on FP / game':level==='edge'?`Side ${leader} has the edge`:`Lopsided toward Side ${leader}`;
 delta.textContent=leader?`Side ${leader} leads by ${format(gap)} FP / game (${format(percentage)}%).`:'Both sides have the same FP / game.';
 scale.setAttribute('aria-label',`${verdict.textContent}. ${delta.textContent}`);
 $('#balance-marker').style.left=`${position}%`;
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
 $('#picker-title').textContent=`Add to Side ${side.toUpperCase()}`;
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
