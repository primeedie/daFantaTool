import {nbaBadge,playerKey} from './public-ui.mjs';
import {boxFields,scoringWeights,tradePoints} from './trade-model.mjs';

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
const rwRank=player=>player.rank==null?'Unranked':`RW #${player.rank}`;
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
   return `<article class="trade-card"><h3>${nbaBadge(player.nba,player.name)}</h3><button class="button" type="button" data-remove="${esc(player.id)}" data-side="${key}" aria-label="Remove ${esc(player.name)}">×</button><span class="sub">${esc(player.position)} · ${rwRank(player)}${profile}</span><strong>${points===null?'No score':`${format(points)} FP / game`}</strong><div class="trade-stats sub">${playerStats(player)}</div></article>`;
  }).join(''):'<p class="trade-empty sub">No players selected.</p>';
 }
 const delta=$('#trade-delta');
 delta.hidden=!picks.a.length||!picks.b.length;
 if(delta.hidden)return;
 const difference=totals.a-totals.b;
 delta.textContent=totals.a===null||totals.b===null?'A comparison needs stats for every selected player.':
  Math.abs(difference)<0.005?'Even on FP per game.':`Side ${difference>0?'A':'B'} leads by ${format(Math.abs(difference))} FP / game.`;
}

async function loadPlayers(){
 if(dataset)return dataset;
 if(!dataRequest)dataRequest=fetch('./trade-data.json').then(async response=>{
  if(!response.ok)throw new Error('Player data unavailable');
  const data=await response.json();
  if(!data.players?.length)throw new Error('Empty player data');
  dataset=data;
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
 const rank=(a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.name.localeCompare(b.name);
 players.sort((a,b)=>sort.value==='fpts'?(fp(b)??-Infinity)-(fp(a)??-Infinity)||rank(a,b):sort.value==='name'?a.name.localeCompare(b.name):rank(a,b));
 status.textContent=players.length>100?`Showing 100 of ${players.length}. Search for a player to narrow the list.`:players.length?'':'No matching players.';
 results.innerHTML=players.slice(0,100).map(player=>{
  const points=fp(player);
  const selected=occupied(player.id);
  return `<button class="picker-row" type="button" data-player-id="${esc(player.id)}" ${selected?'disabled':''}><span>${player.rank==null?'—':`#${player.rank}`}</span><span><strong>${esc(player.name)}</strong><span class="sub">${nbaBadge(player.nba)} ${esc(player.position)}</span></span><span>${selected?'Added':points===null?'No stats':`${format(points)} FP`}</span></button>`;
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
