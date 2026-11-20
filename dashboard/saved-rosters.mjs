import {nbaBadge,playerKey} from './public-ui.mjs';
import {playerInjury} from './trade-model.mjs?v=il-estimates';
import {bigBalls} from './big-balls.mjs?v=2026-11-20';
import {smallBalls} from './small-balls.mjs?v=reed-pickup';

const publicLeagues=[bigBalls,smallBalls];
const publicLeague=id=>publicLeagues.find(config=>config.id===id);
const isPublicLeague=config=>publicLeagues.includes(config);

const storageKey='dafantatool.saved-rosters.v1';
const keys=['a','b'];
const clean=(value,max=60)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
const numeric=(value,min)=>Number.isInteger(value)&&value>=min&&value<=99;
const playerList=text=>text.split(/[,\n]/).map(value=>clean(value)).filter(Boolean);
const members=team=>[...team.players,...team.injured,...(team.unassigned||[])].map(playerKey);

export function estimateInjurySlots(team,regular,outPlayers){
 if(!team.unassigned?.length)return team;
 const regularCandidates=[...team.players,...team.unassigned];
 const needed=Math.max(0,regularCandidates.length-regular);
 const candidates=regularCandidates.filter(name=>outPlayers.has(playerKey(name)));
 const likely=needed>0&&needed===candidates.length?candidates:[];
 const resolved=!needed||likely.length===needed;
 const estimatedRegular=resolved?team.unassigned.filter(name=>!likely.includes(name)):[];
 return {
  ...team,
  players:resolved?regularCandidates.filter(name=>!likely.includes(name)):team.players,
  injured:[...team.injured,...likely],
  unassigned:resolved?[]:team.unassigned,
  ilEstimate:{needed,candidates,likely,regular:estimatedRegular}
 };
}

export function normalizeRosterConfig(value){
 if(!value||!numeric(value.regular,1)||!numeric(value.il,0)||!Array.isArray(value.teams)||!value.teams.length||value.teams.length>30)return null;
 const name=clean(value.name);
 if(!name)return null;
 const usedTeams=new Set(),usedPlayers=new Set();
 const teams=[];
 for(const team of value.teams){
  const teamName=clean(team?.name);
  if(!teamName||usedTeams.has(teamName.toLowerCase())||!Array.isArray(team.players)||!Array.isArray(team.injured)||team.players.length>value.regular||team.injured.length>value.il)return null;
  usedTeams.add(teamName.toLowerCase());
  const people={name:teamName,players:team.players.map(value=>clean(value)),injured:team.injured.map(value=>clean(value))};
  if(team.unassigned!==undefined){
   if(!Array.isArray(team.unassigned)||team.players.length+team.injured.length+team.unassigned.length>value.regular+value.il)return null;
   if(team.unassigned.length)people.unassigned=team.unassigned.map(value=>clean(value));
  }
  for(const id of members(people)){
   if(!id||usedPlayers.has(id))return null;
   usedPlayers.add(id);
  }
  teams.push(people);
 }
 return {name,regular:value.regular,il:value.il,teams};
}

export function savedRosterFilter(config,team,action){
 if(action==='pickup'){
  const rostered=new Set(config?.teams.flatMap(members));
  return player=>!rostered.has(playerKey(player.name));
 }
 if(!team)return ()=>true;
 const eligible=new Set(action==='cut'?team.players.map(playerKey):members(team));
 return player=>eligible.has(playerKey(player.name));
}

export function rosterConfigHash(config){
 const bytes=new TextEncoder().encode(JSON.stringify(config));
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return '#r=1~'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

export function parseRosterConfig(hash){
 if(!hash.startsWith('#r=1~')||hash.length>250000)return null;
 try {
  const bytes=Uint8Array.from(atob(hash.slice(5).replaceAll('-','+').replaceAll('_','/')),letter=>letter.charCodeAt(0));
  return normalizeRosterConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 } catch {return null;}
}

export function setupRosterBook(onChange,openFreeAgents,openRosterPicker,loadPlayers){
 const $=selector=>document.querySelector(selector);
 const dialog=$('#saved-rosters-dialog'),form=$('#saved-rosters-form');
 const configs=$('#saved-config-select'),teams=$('#saved-team-select');
 const status=$('#saved-rosters-status'),share=$('#saved-rosters-url');
 const importButton=$('#save-roster-import');
 const selectors=Object.fromEntries(keys.map(key=>[key,$(`#saved-team-${key}`)]));
 const value=name=>form.elements.namedItem(name);
 let library=[];
 let publicEstimates=new Map();
 try {
  const stored=JSON.parse(localStorage.getItem(storageKey)||'[]');
  library=stored.map(normalizeRosterConfig).filter(Boolean);
 } catch {}
 let imported=parseRosterConfig(location.hash);
 const option=(label,id)=>new Option(label,id);
 const configById=id=>publicLeague(id)||(id===''?null:library[Number(id)]);
 const current=()=>configById(configs.value);
 const currentTeam=()=>teams.value===''?null:current()?.teams[Number(teams.value)];
 const getTeam=key=>{
  const [configIndex,teamIndex]=selectors[key].value.split(':');
  const config=configById(configIndex),team=config?.teams[teamIndex];
  return team?{config,team:publicEstimates.get(team)||team}:null;
 };

 function refreshSelectors(){
  for(const select of Object.values(selectors)){
   const prior=select.value;
   const publicTeams=publicLeagues.map(config=>{
    const group=document.createElement('optgroup');
    group.label=`${config.name} (public)`;
    group.append(...config.teams.map((team,i)=>option(`${team.name} · ${config.name}`,`${config.id}:${i}`)));
    return group;
   });
   select.replaceChildren(option('Any player', ''),...publicTeams,...library.flatMap((config,i)=>config.teams.map((team,j)=>option(`${team.name} · ${config.name} (local)`,`${i}:${j}`))));
   select.value=[...select.options].some(item=>item.value===prior)?prior:'';
  }
 }
 function loadTeam(){
  const original=currentTeam(),team=publicEstimates.get(original)||original;
  value('teamName').value=team?.name||'';
  value('regularPlayers').value=team?.players.join('\n')||'';
  value('injuredPlayers').value=team?.injured.join('\n')||'';
  value('unassignedPlayers').value=team?.unassigned?.join('\n')||'';
  $('#unassigned-roster-field').hidden=!team?.unassigned?.length;
  $('#share-saved-team').disabled=!team;
  const publicView=isPublicLeague(current());
  const summary=$('#roster-il-estimate');
  const estimate=team?.ilEstimate;
  summary.hidden=!publicView||!estimate;
  summary.textContent=estimate?.needed?estimate.likely.length?
   `${team.injured.length} projected IL, including ${estimate.likely.length} inferred from the injury report.`:
   `At least ${original.injured.length+estimate.needed} IL spots needed. ${estimate.needed} ${estimate.needed===1?'placement':'placements'} unconfirmed.`:
   'New pickups fit in the regular roster.';
  const previews=[...form.querySelectorAll('[data-roster-preview]')];
  for(const preview of previews){
   const field=value(preview.dataset.rosterPreview);
   field.hidden=publicView;
   preview.hidden=!publicView;
   preview.textContent=field.value?'Loading players…':'—';
  }
  if(publicView)loadPlayers().then(data=>{
   if(!isPublicLeague(current())||currentTeam()!==original||(publicEstimates.get(original)||original)!==team)return;
   const byName=new Map((data?.players||[]).map(player=>[playerKey(player.name),player.nba]));
   for(const preview of previews){
    const names=playerList(value(preview.dataset.rosterPreview).value);
    preview.innerHTML=names.map(name=>{
     const label=estimate?.likely.includes(name)?'Likely IL':estimate?.regular.includes(name)?'Estimated regular':'';
     return label?`<span>${nbaBadge(byName.get(playerKey(name)),name)} <small class="sub">${label}</small></span>`:nbaBadge(byName.get(playerKey(name)),name);
    }).join(' ')||'—';
   }
   if(estimate?.needed&&!estimate.likely.length&&estimate.candidates.length){
    summary.insertAdjacentHTML('beforeend',` Injury candidates include ${estimate.candidates.map(name=>nbaBadge(byName.get(playerKey(name)),name)).join(' ')}.`);
   }
  });
 }
 function selectConfig(index='',teamIndex='0'){
  configs.replaceChildren(option('New configuration',''),...publicLeagues.map(config=>option(`${config.name} (public)`,config.id)),...library.map((config,i)=>option(`${config.name} (local)`,i)));
  configs.value=index;
  const config=current();
  const isPublic=isPublicLeague(config);
  value('configName').value=config?.name||'';
  value('regular').value=config?.regular??13;
  value('il').value=config?.il??3;
  teams.replaceChildren(...(isPublic?[]:[option('New team','')]),...(config?.teams||[]).map((team,i)=>option(team.name,i)));
  teams.value=config?teamIndex:'';
  loadTeam();
  $('#share-saved-config').disabled=!config;
  $('#browse-free-agents').disabled=!config;
  for(const field of form.querySelectorAll('input,textarea'))field.readOnly=isPublic;
  for(const button of form.querySelectorAll('[data-draft-roster]'))button.hidden=isPublic;
  $('#save-roster-team').hidden=isPublic;
  $('#copy-public-roster').hidden=!isPublic;
  const publicNote=$('#public-roster-note');
  publicNote.hidden=!isPublic;
  publicNote.textContent=isPublic?`Public snapshot · ${config.asOf} · ${config.teams.length} teams`:'';
  share.hidden=true;
 }
 function save(config,index){
  const next=[...library];
  next[index]=config;
  try {localStorage.setItem(storageKey,JSON.stringify(next));}
  catch {status.textContent='This browser could not save the configuration.';return false;}
  library=next;
  refreshSelectors();
  onChange(keys.some(key=>getTeam(key)?.config===config)?config:null);
  return true;
 }
 async function copyConfig(config){
  const url=new URL(location.href);
  url.search='';
  url.hash=isPublicLeague(config)?'':rosterConfigHash(config);
  if(isPublicLeague(config))url.searchParams.set('league',config.id);
  try {await navigator.clipboard.writeText(url.href);status.textContent='Roster link copied.';share.hidden=true;}
  catch {share.value=url.href;share.hidden=false;share.select();status.textContent='Copy this roster link.';}
 }

 const open=()=>{selectConfig(publicLeague(new URLSearchParams(location.search).get('league'))?.id||(!library.length?bigBalls.id:'0'));status.textContent='';importButton.hidden=true;dialog.showModal();};
 $('#open-roster-book').addEventListener('click',open);
 $('#setup-roster-book').addEventListener('click',open);
 $('#close-roster-book').addEventListener('click',()=>dialog.close());
 configs.addEventListener('change',()=>selectConfig(configs.value));
 teams.addEventListener('change',loadTeam);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(isPublicLeague(current()))return;
  const index=configs.value===''?library.length:Number(configs.value);
  const existing=current();
  const teamList=[...(existing?.teams||[])];
  const teamIndex=teams.value===''?teamList.length:Number(teams.value);
  teamList[teamIndex]={name:value('teamName').value,players:playerList(value('regularPlayers').value),injured:playerList(value('injuredPlayers').value)};
  const unassigned=playerList(value('unassignedPlayers').value);
  if(unassigned.length)teamList[teamIndex].unassigned=unassigned;
  const config=normalizeRosterConfig({name:value('configName').value,regular:Number(value('regular').value),il:Number(value('il').value),teams:teamList});
  if(!config){status.textContent='Check roster limits and use each player and team name once per configuration.';return;}
  if(save(config,index)){selectConfig(String(index),String(teamIndex));status.textContent='Saved on this browser.';}
 });
 $('#share-saved-config').addEventListener('click',()=>{if(current())copyConfig(current());});
 $('#share-saved-team').addEventListener('click',()=>{if(currentTeam())copyConfig({...current(),teams:[currentTeam()]});});
 $('#browse-free-agents').addEventListener('click',()=>{if(current())openFreeAgents(current());});
 $('#copy-public-roster').addEventListener('click',()=>{
  const config=current();
  if(!isPublicLeague(config))return;
  const index=library.length;
  const copy=normalizeRosterConfig({...config,name:`${config.name} (copy)`});
  if(save(copy,index)){selectConfig(String(index),teams.value);status.textContent='Editable copy saved on this browser.';}
 });
 for(const button of form.querySelectorAll('[data-draft-roster]'))button.addEventListener('click',()=>{
  const group=button.dataset.draftRoster;
  const field=value(group==='il'?'injuredPlayers':'regularPlayers');
  const names=playerList(field.value);
  const limit=Number(value(group).value);
  if(!numeric(limit,group==='il'?0:1)){value(group).reportValidity();return;}
  if(names.length>=limit){status.textContent=group==='il'?'The injured list has no open spots.':'The regular roster has no open spots.';return;}
  const otherTeams=(current()?.teams||[]).filter((_team,index)=>String(index)!==teams.value);
  const entered=['regularPlayers','injuredPlayers','unassignedPlayers'].flatMap(name=>playerList(value(name).value)).map(playerKey);
  const taken=new Set([...entered,...otherTeams.flatMap(members)]);
  const rostered=player=>taken.has(playerKey(player.name));
  const remaining=()=>limit-names.length;
  openRosterPicker({
   title:group==='il'?'Add IL players':'Add regular roster players',rostered,remaining,
   add(player){
    if(!remaining()||rostered(player))return;
    names.push(player.name);
    taken.add(playerKey(player.name));
    field.value=names.join('\n');
    status.textContent='Click Save Team to keep your changes.';
   }
  });
 });
 importButton.addEventListener('click',()=>{
  if(!imported)return;
  const index=library.length;
  if(save(imported,index)){
   selectConfig(String(index));
   imported=null;
   importButton.hidden=true;
   status.textContent='Imported and saved on this browser.';
   history.replaceState(null,'',location.pathname+location.search);
  }
 });
 for(const [key,select] of Object.entries(selectors))select.addEventListener('change',()=>onChange(getTeam(key)?.config,key));
 refreshSelectors();
 if(location.hash.startsWith('#r=')){
  open();
  importButton.hidden=!imported;
  status.textContent=imported?`${imported.name} · ${imported.teams.map(team=>team.name).join(', ')}`:'Could not open this roster link.';
 }
 return {getTeam,setInjuryEstimates(players,report){
  const age=(Date.now()-Date.parse(report?.updatedAt))/3600000;
  const out=new Set();
  if(age>=0&&age<=48){
   for(const player of players){
    const injury=playerInjury(player,report.players);
    if(/^(out|out for season|ofs|injured|il)$/i.test(injury?.status||''))out.add(playerKey(player.name));
   }
  }
  publicEstimates=new Map(publicLeagues.flatMap(config=>config.teams.map(team=>[team,estimateInjurySlots(team,config.regular,out)])));
  if(dialog.open&&isPublicLeague(current()))loadTeam();
 }};
}
