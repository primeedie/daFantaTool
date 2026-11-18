import {publicGames,recentStats,validateSnapshot} from './public-ui.mjs';
import {slots,optimizeLineup,streamEstimate,snapshotMatchup,remainingWeek} from './model.mjs';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number.isFinite(Number(v))&&v!==null?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const signed=v=>`${v>=0?'+':''}${fmt(v)}`;
const fold=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
let data,teamId='4',page='briefing',protectedNames=new Set();
try{protectedNames=new Set(JSON.parse(localStorage.getItem('shohoku-protected')||'[]'));}catch{}
const titles={briefing:'DAILY BRIEFING',lineup:'LINEUP PLANNER',waivers:'WAIVER FINDER',matchup:'WEEKLY MATCHUP',streaming:'STREAMING PLANNER',league:'THE LEAGUE',trades:'TRADES & ACTIVITY',coverage:'DATA COVERAGE'};
const team=()=>data.teams.find(t=>t.id===teamId);
const teamName=id=>data.teams.find(t=>t.id===id)?.name||id;
const matchup=()=>snapshotMatchup(data,teamId);
const playing=p=>data.playingTeams.includes(p.nba);
const healthy=p=>!['O','NA'].includes(p.status);
const statusTag=p=>p.status?`<span class="tag ${p.status==='O'?'red':'gold'}">${esc(p.status)}</span>`:'';
const playerButton=p=>`<button class="player-link" data-player="${encodeURIComponent(p.name)}">${esc(p.name)}</button>`;
const playerCell=p=>`<div class="player-name">${playerButton(p)} ${statusTag(p)}</div><div class="player-meta">${esc(p.nba)} · ${esc(p.positions.join(', '))}</div>`;
const protectButton=p=>`<button class="star ${protectedNames.has(p.name)?'selected':''}" data-protect="${encodeURIComponent(p.name)}" aria-label="${protectedNames.has(p.name)?'Unprotect':'Protect'} ${esc(p.name)}" title="Protect from drop comparisons">${protectedNames.has(p.name)?'★':'☆'}</button>`;
const panel=(title,body,sub='',link='')=>`<section class="panel"><div class="panel-head"><div><h2>${title}</h2>${sub?`<p class="sub">${sub}</p>`:''}</div>${link}</div>${body}</section>`;
const stat=(label,value,detail,icon='')=>`<div class="stat"><label>${label}</label><strong>${value}</strong><small>${detail}</small><span class="accent" aria-hidden="true">${icon}</span></div>`;
const note=(n,title,detail)=>`<div class="notice-row"><span class="notice-number">${n}</span><div><h3>${title}</h3><p>${detail}</p></div></div>`;
const pendingNames=()=>new Set(data.trades.filter(t=>t.from===teamId||t.to===teamId).flatMap(t=>[...t.send,...t.receive]));
function drops(){const pending=pendingNames();return team().players.filter(p=>p.slot!=='IL'&&healthy(p)&&!protectedNames.has(p.name)&&!pending.has(p.name)).sort((a,b)=>a.fpts-b.fpts);}
function pageTop(){return `<div class="page-top"><div><div class="eyebrow">${esc(data.league)} / ${esc(team().name)}</div><h1>${titles[page]||titles.briefing}</h1><p class="sub">Nov 18, 2026 · Week 5 · Head-to-head points</p></div><span class="snapshot-badge"><i></i> SNAPSHOT · NOV 18</span></div>`;}
function scoreboard(){const m=matchup(),t=team(),ratio=m.score/Math.max(1,m.score+m.opponentScore)*100;return `<div class="match-card"><div class="eyebrow">WEEK 5 <span class="muted">/ IN PROGRESS AT CAPTURE</span></div><div class="scoreboard"><div class="score-side mine"><div class="name">${esc(t.name)}</div><div class="score">${fmt(m.score,1)}</div><div class="record">${esc(t.record)} · #${t.rank}</div></div><span class="versus">VS</span><div class="score-side right"><div class="name">${esc(m.opponent.name)}</div><div class="score">${fmt(m.opponentScore,1)}</div><div class="record">${esc(m.opponent.record)} · #${m.opponent.rank}</div></div></div><div class="bar"><span data-width="${ratio}"></span></div><div class="bar-label"><span>${m.score>=m.opponentScore?'Leading':'Trailing'} by ${fmt(Math.abs(m.score-m.opponentScore),1)}</span><a href="#matchup">View matchup ↗</a></div></div>`;}
function rosterTable(players,{protection=false,stats=false}={}){return `<div class="table-wrap"><table><thead><tr><th>Slot</th><th>Player</th><th>NBA day 11/17</th><th class="num">GP</th>${stats?'<th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">ST</th><th class="num">BLK</th><th class="num">TO</th>':''}<th class="num">FP / game</th>${protection?'<th>Keep</th>':''}</tr></thead><tbody>${players.map(p=>`<tr><td><span class="slot">${esc(p.slot)}</span></td><td>${playerCell(p)}</td><td>${playing(p)?'<span class="tag green">GAME</span>':'<span class="muted">Off</span>'}</td><td class="num">${fmt(p.gp,0)}</td>${stats?['pts','reb','ast','st','blk','to'].map(k=>`<td class="num">${fmt(p[k],1)}</td>`).join(''):''}<td class="num fp">${fmt(p.fpts)}</td>${protection?`<td>${protectButton(p)}</td>`:''}</tr>`).join('')}</tbody></table></div>`;}
function briefing(){
 const t=team(),inj=t.players.filter(p=>p.status),trades=data.trades.filter(x=>x.from===teamId||x.to===teamId),current=t.players.filter(p=>p.slot!=='IL'&&healthy(p)&&playing(p)),own=teamId===data.ownerTeam;
 const best=data.available.filter(p=>p.availability==='FA'&&healthy(p)).sort((a,b)=>b.fpts-a.fpts).slice(0,5);
 const notes=[note('01',`${current.length} eligible players have a game`,`${data.games.map(g=>g.join(' @ ')).join(' · ')}. NBA day Nov 17; games may already be underway.`),note('02',`${inj.length} status flags`,`${inj.map(p=>`${esc(p.name)} (${p.status})`).join(', ')||'None in this snapshot.'}`),note('03',own?'2 adds remaining':'League limit: 4 weekly adds',own?'Two of four adds used. Save room for injury updates.':'Other teams’ weekly add usage was not visible.'),note('04',`${trades.length} visible trades`,trades.length?'Processing and proposed trades are listed separately. Roster suggestions use the pre-trade snapshot.':'No pending trade details were visible for this team.')];
 return `<div class="stats">${stat('Standing',`#${t.rank}`,`${t.record} record`,'↗')}${stat('Season points',fmt(t.points,1),'Through week 4')}${stat('Weekly adds left',own?'2 / 4':'—',own?'2 used this week':'Usage not captured')}${stat('Waiver priority',`#${t.waiver}`,'Continual rolling list')}</div><div class="grid two">${panel('Current matchup',scoreboard())}${panel('On your radar',`<div class="panel-body">${notes.slice(0,3).join('')}</div>`)}</div><div class="grid equal section-gap">${panel('Available now',`<div class="table-wrap"><table><thead><tr><th>Player</th><th class="num">FP / game</th><th class="num">GP</th></tr></thead><tbody>${best.map(p=>`<tr><td>${playerCell(p)}</td><td class="num fp">${fmt(p.fpts)}</td><td class="num">${p.gp}</td></tr>`).join('')}</tbody></table></div>`,'Season averages · healthy free agents','<a class="panel-link" href="#waivers">All players ↗</a>')}${panel('Roster notes',`<div class="panel-body">${notes[3]}${note('05',`${t.players.filter(p=>p.slot==='IL').length} players on IL`,t.players.filter(p=>p.slot==='IL').map(p=>esc(p.name)).join(', ')||'No IL players.')}<div class="notice-row"><span class="notice-number">06</span><div><h3>No live sync</h3><p>Scores and statuses reflect the November 18 snapshot. Open Yahoo to confirm a move.</p></div></div></div>`)}</div>${recentGamesPanel()}`;
}
function recentGamesPanel(){if(data.publicFeed)return panel('NBA games',publicGames(data.publicFeed));const r=data.recentGames;return `<div class="section-gap">${panel('Recent NBA games',`<div class="table-wrap"><table><thead><tr><th>Away</th><th>Home</th><th class="num">Score</th><th>Status</th></tr></thead><tbody>${r.games.map(g=>`<tr><td>${g.away}</td><td>${g.home}</td><td class="num fp">${g.awayScore} – ${g.homeScore}</td><td><span class="tag green">FINAL</span></td></tr>`).join('')}</tbody></table></div><div class="footnote">Public scores only. Individual game logs are not loaded.</div>`,`U.S. game date ${r.gameDate} · retrieved Nov 18`,`<a class="panel-link" href="${r.sourceUrl}" target="_blank" rel="noopener noreferrer">RotoWire ↗</a>`)}</div>`;}
const lineupState={mode:'game',includeQ:true};
function lineup(){const t=team(),plan=optimizeLineup(t.players,{playingTeams:lineupState.mode==='game'?data.playingTeams:lineupState.mode==='all'?null:[...new Set(data.publicFeed.games.filter(g=>g.gameDate===lineupState.mode&&!/postpon|cancel/i.test(g.status)).flatMap(g=>[g.home,g.away]))],includeQ:lineupState.includeQ}),selected=new Set(plan.assignment.filter(Boolean).map(p=>p.name));
 return `<div class="controls"><label for="lineup-mode">Plan</label><select id="lineup-mode"><option value="game" ${lineupState.mode==='game'?'selected':''}>NBA day Nov 17</option>${[...new Set((data.publicFeed?.games||[]).filter(g=>g.gameDate>=data.publicFeed.nbaDate).map(g=>g.gameDate))].map(d=>`<option value="${d}" ${lineupState.mode===d?'selected':''}>${d} � NBA schedule</option>`).join('')}<option value="all" ${lineupState.mode==='all'?'selected':''}>All players · position check</option></select><label><input id="include-q" type="checkbox" ${lineupState.includeQ?'checked':''}> Include questionable</label></div><div class="stats">${stat('Filled slots',`${selected.size} / 10`,'Position-eligible assignment')}${stat('Average-points sum',fmt(plan.score,1),'Season averages, not a forecast')}${stat('Out',t.players.filter(p=>p.status==='O').length,'Excluded from suggestions')}${stat('On IL',t.players.filter(p=>p.slot==='IL').length,'Excluded from suggestions')}</div>${panel('Suggested lineup',`<div class="table-wrap"><table><thead><tr><th>Slot</th><th>Player</th><th>Captured slot</th><th class="num">FP / game</th></tr></thead><tbody>${slots.map((s,i)=>{const p=plan.assignment[i];return `<tr><td class="slot">${s}</td><td>${p?playerCell(p):'<span class="muted">No eligible player</span>'}</td><td>${p?esc(p.slot):'—'}</td><td class="num fp">${p?fmt(p.fpts):'—'}</td></tr>`}).join('')}</tbody></table></div><div class="footnote">Planning only. Started games may be locked in Yahoo. Out, unavailable, and IL players are excluded. No lineup changes are sent.</div>`)}<div class="section-gap">${panel('Bench & IL',rosterTable(t.players.filter(p=>!selected.has(p.name)),{protection:true}),'Stars protect players from drop comparisons.')}</div>`;
}
const waiverState={search:'',pos:'all',availability:'all',hideUnavailable:true,sort:'fpts',page:0};
function waivers(){return `<div class="controls"><label class="sr-only" for="waiver-search">Search available players</label><input type="search" id="waiver-search" placeholder="Search players or NBA teams" value="${esc(waiverState.search)}"><label class="sr-only" for="waiver-pos">Position</label><select id="waiver-pos">${['all','PG','SG','SF','PF','C'].map(v=>`<option value="${v}" ${v===waiverState.pos?'selected':''}>${v==='all'?'All positions':v}</option>`).join('')}</select><label class="sr-only" for="waiver-status">Availability</label><select id="waiver-status">${[['all','FA + waivers'],['FA','Free agents'],['W','Waivers']].map(([v,l])=>`<option value="${v}" ${v===waiverState.availability?'selected':''}>${l}</option>`).join('')}</select><label><input type="checkbox" id="waiver-healthy" ${waiverState.hideUnavailable?'checked':''}> Hide out / NA</label><label class="sr-only" for="waiver-sort">Sort</label><select id="waiver-sort"><option value="fpts" ${waiverState.sort==='fpts'?'selected':''}>FP / game ↓</option><option value="gp" ${waiverState.sort==='gp'?'selected':''}>Games played ↓</option><option value="name" ${waiverState.sort==='name'?'selected':''}>Name A–Z</option></select></div>${panel('Available players','<div id="waiver-results"></div>','Eligibility and waiver status from Yahoo.')}<p class="sub">Δ compares season averages against your lowest eligible, unprotected player outside visible trades. It does not account for future schedules or the Can’t Cut List.</p>`;}
function updateWaivers(){
 let rows=data.available.filter(p=>(waiverState.pos==='all'||p.positions.includes(waiverState.pos))&&(waiverState.availability==='all'||(waiverState.availability==='W'?p.availability!=='FA':p.availability==='FA'))&&(!waiverState.hideUnavailable||healthy(p))&&fold(`${p.name} ${p.nba}`).includes(fold(waiverState.search)));
 rows.sort((a,b)=>waiverState.sort==='name'?a.name.localeCompare(b.name):b[waiverState.sort]-a[waiverState.sort]);
 const count=rows.length,max=Math.max(0,Math.ceil(count/25)-1);waiverState.page=Math.min(waiverState.page,max);const start=waiverState.page*25;const baseline=drops()[0];
 $('#waiver-results').innerHTML=`<div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Status</th><th class="num">GP</th><th class="num">FP / game</th><th class="num">Δ / game</th><th>Note</th></tr></thead><tbody>${rows.slice(start,start+25).map((p,i)=>`<tr><td class="rank">${start+i+1}</td><td>${playerCell(p)}</td><td><span class="tag ${p.availability==='FA'?'green':'gold'}">${esc(p.availability)}</span></td><td class="num">${fmt(p.gp,0)}</td><td class="num fp">${fmt(p.fpts)}</td><td class="num ${baseline&&p.fpts>baseline.fpts?'positive':'muted'}">${baseline?signed(p.fpts-baseline.fpts):'—'}</td><td class="muted">${p.gp===null?'No appearances':p.gp<5?'Small sample':p.availability!=='FA'?'Waiver claim needed':playing(p)?'Game on captured date':'No game on captured date'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No matching players.</td></tr>'}</tbody></table></div><div class="pagination"><span>${count?`${start+1}–${Math.min(start+25,count)}`:'0'} of ${count}</span><div><button data-waiver-page="-1" ${waiverState.page===0?'disabled':''}>← Previous</button><button data-waiver-page="1" ${waiverState.page===max?'disabled':''}>Next →</button></div></div>`;
}
function weekProjection(m){
 const projection=remainingWeek(data,[team().players,m.opponent.players]);
 if(!projection)return `<div class="panel-body"><p class="sub">ESPN schedule coverage for this Yahoo matchup is unavailable.</p></div>`;
 const [home,away]=projection.totals;
 const myTotal=m.score+home.points,opponentTotal=m.opponentScore+away.points;
 return `<div class="panel-body"><div class="metric-row"><div><span class="small-label">${esc(team().name)}</span><b>${home.games}</b><span class="sub">Remaining starts</span></div><div><span class="small-label">${esc(m.opponent.name)}</span><b>${away.games}</b><span class="sub">Remaining starts</span></div></div><div class="result-box"><h3>Projected score</h3><strong>${fmt(myTotal,1)} – ${fmt(opponentTotal,1)}</strong><p>${signed(myTotal-opponentTotal)} FP margin</p></div><p class="sub">As of the Yahoo snapshot. Uses ESPN tipoffs through ${esc(projection.end)}, eligible slots, and each starter’s Yahoo FP per game. Games already underway are excluded from added points.</p></div>`;
}
function weeklyMatchup(){
 const m=matchup(),a=optimizeLineup(team().players),b=optimizeLineup(m.opponent.players);
 return `${scoreboard()}<div class="grid equal section-gap">${panel('Roster comparison',`<div class="panel-body"><div class="metric-row"><div><span class="small-label">${esc(team().name)}</span><b>${fmt(a.score,1)}</b><span class="sub">Best 10 average</span></div><div><span class="small-label">${esc(m.opponent.name)}</span><b>${fmt(b.score,1)}</b><span class="sub">Best 10 average</span></div></div></div>`)}${panel('Remaining week estimate',weekProjection(m))}</div><div class="grid equal section-gap">${panel(esc(team().name),rosterTable(team().players))}${panel(esc(m.opponent.name),rosterTable(m.opponent.players))}</div>`;
}
function streaming(){const candidates=data.available.filter(p=>p.availability==='FA'&&healthy(p)&&p.gp>=5).sort((a,b)=>b.fpts-a.fpts),dropPlayers=drops(),own=teamId===data.ownerTeam;return `<div class="grid two">${panel('Compare an add / drop',`<div class="panel-body"><div class="form-grid"><div class="field"><label for="stream-add">Add · free agents</label><select id="stream-add">${candidates.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} · ${fmt(p.fpts)} FP</option>`).join('')}</select></div><div class="field"><label for="stream-drop">Drop comparison</label><select id="stream-drop">${dropPlayers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} · ${fmt(p.fpts)} FP</option>`).join('')}</select></div><div class="field"><label for="stream-new-games">Usable games from the pickup</label><input id="stream-new-games" type="number" min="0" max="7" placeholder="0–7"></div><div class="field"><label for="stream-old-games">Usable games lost from the drop</label><input id="stream-old-games" type="number" min="0" max="7" placeholder="0–7"></div>${own?'':`<div class="field"><label for="stream-remaining">Adds remaining · not captured</label><input id="stream-remaining" type="number" min="0" max="4" placeholder="0–4"></div>`}</div><button id="calculate-stream" class="button primary section-gap">Compare</button><div id="stream-result"></div></div>`)}${panel('Plan rules',`<div class="panel-body"><ul class="coverage-list"><li>Weekly limit <strong>4 adds</strong></li><li>Remaining <strong>${own?'2':'Enter your count'}</strong></li><li>Waivers <strong>2 days</strong></li><li>Lineups <strong>Daily – Today</strong></li></ul><ul class="help-list"><li>Count only games that fit open lineup slots.</li><li>Count from the date the pickup is eligible.</li><li>Protected players and visible trade participants are excluded from drop comparisons.</li><li>Confirm Yahoo’s lock times and Can’t Cut List.</li></ul><p class="sub">This compares one pickup at a time. No schedule-based multi-add sequence is generated yet.</p></div>`)}</div>`;}
const leagueState={tab:'standings',roster:'4'};
function league(){return `<div class="controls">${[['standings','Standings'],['rosters','All rosters'],['draft','Draft'],['schedule','My schedule']].map(([id,label])=>`<button class="button ${leagueState.tab===id?'dark':''}" data-league-tab="${id}">${label}</button>`).join('')}</div>${leagueBody()}`;}
function leagueBody(){
 if(leagueState.tab==='rosters'){const t=data.teams.find(t=>t.id===leagueState.roster);return `<div class="controls"><label for="roster-team">Roster</label><select id="roster-team">${data.teams.map(t=>`<option value="${t.id}" ${t.id===leagueState.roster?'selected':''}>${esc(t.name)}</option>`).join('')}</select><span class="sub">${t.players.length} players · season averages</span></div>${panel(esc(t.name),rosterTable(t.players,{stats:true,protection:true}))}`;}
 if(leagueState.tab==='draft')return panel('Draft results',`<div class="table-wrap"><table><thead><tr><th>Pick</th><th>Round</th><th>Player</th><th>Team</th></tr></thead><tbody>${data.draft.map(p=>`<tr><td class="rank">${p.pick}</td><td>${Math.ceil(p.pick/10)}</td><td>${esc(p.name)}</td><td>${esc(teamName(p.team_id))}</td></tr>`).join('')}</tbody></table></div>`,'130 picks · original draft');
 if(leagueState.tab==='schedule')return panel('John NBA schedule',`<div class="table-wrap"><table><thead><tr><th>Week</th><th>Opponent</th><th>Result</th><th class="num">Final score</th></tr></thead><tbody>${data.schedule.map(r=>`<tr><td>${r[0]}</td><td>${esc(teamName(r[1]))}</td><td>${r[2]||'Upcoming'}</td><td class="num">${r.length>3?`${fmt(r[3],1)} – ${fmt(r[4],1)}`:'—'}</td></tr>`).join('')}</tbody></table></div>`,'Other teams’ future schedules were not captured.');
 return panel('Standings',`<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th class="num">Season points</th><th class="num">Waiver</th><th class="num">Moves</th></tr></thead><tbody>${data.teams.map(t=>`<tr class="${t.id===teamId?'row-mine':''}"><td class="rank">${t.rank}</td><td><button class="player-link" data-switch-team="${t.id}">${esc(t.name)}</button></td><td>${t.record}</td><td class="num fp">${fmt(t.points,1)}</td><td class="num">${t.waiver}</td><td class="num">${t.moves}</td></tr>`).join('')}</tbody></table></div>`,'Standings through week 4');
}
const activityState={team:'all',action:'all',search:'',page:0};
function trades(){return `${panel('Visible trades',data.trades.map(t=>`<article class="trade"><div class="trade-top"><h3>${esc(teamName(t.from))} <span class="muted">↔</span> ${esc(teamName(t.to))}</h3><span class="tag ${t.status==='Processing'?'gold':''}">${t.status.toUpperCase()}</span></div><div class="trade-grid"><div><div class="small-label">${esc(teamName(t.from))} sends</div><ul>${t.send.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div><span class="arrow">⇄</span><div><div class="small-label">${esc(teamName(t.to))} sends</div><ul>${t.receive.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div></div><div class="trade-note">${esc(t.note)}</div><a class="panel-link" href="${t.url}" target="_blank" rel="noopener noreferrer">View in Yahoo ↗</a></article>`).join(''),'Trade details captured from Yahoo.')}<div class="section-gap controls"><label class="sr-only" for="activity-search">Search activity</label><input type="search" id="activity-search" placeholder="Search transactions" value="${esc(activityState.search)}"><label class="sr-only" for="activity-team">Filter team</label><select id="activity-team"><option value="all">All teams</option>${data.teams.map(t=>`<option value="${t.id}" ${activityState.team===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select><label class="sr-only" for="activity-action">Transaction type</label><select id="activity-action">${['all','Add','Drop','Trade','Waiver'].map(v=>`<option value="${v}" ${activityState.action===v?'selected':''}>${v==='all'?'All activity':v}</option>`).join('')}</select></div>${panel('Transactions','<div id="activity-results"></div>','October 5 – November 18 · dates as displayed by Yahoo')}`;}
function updateActivity(){let rows=data.transactions.filter(t=>(activityState.team==='all'||t.team.split(',').includes(activityState.team))&&(activityState.action==='all'||t.action.toLowerCase().includes(activityState.action.toLowerCase()))&&fold(t.details).includes(fold(activityState.search)));const max=Math.max(0,Math.ceil(rows.length/25)-1);activityState.page=Math.min(activityState.page,max);const start=activityState.page*25;$('#activity-results').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Team</th><th>Action</th><th>Players</th></tr></thead><tbody>${rows.slice(start,start+25).map(t=>`<tr><td>${t.date}</td><td>${t.team.split(',').map(id=>esc(teamName(id))).join(' / ')}</td><td><span class="tag">${esc(t.action)}</span></td><td>${esc(t.details)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No matching transactions.</td></tr>'}</tbody></table></div><div class="pagination"><span>${rows.length?start+1:0}–${Math.min(start+25,rows.length)} of ${rows.length}</span><div><button data-activity-page="-1" ${activityState.page===0?'disabled':''}>← Previous</button><button data-activity-page="1" ${activityState.page===max?'disabled':''}>Next →</button></div></div>`;}
function coverage(){return `<div class="grid equal">${panel('Snapshot',`<div class="panel-body"><ul class="coverage-list"><li>Captured <strong>Nov 18, 2026</strong></li><li>Rostered players <strong>${data.teams.reduce((n,t)=>n+t.players.length,0)}</strong></li><li>Available players <strong>${data.available.length}</strong></li><li>Transactions <strong>${data.transactions.length}</strong></li><li>Draft picks <strong>${data.draft.length}</strong></li><li>Live refresh <strong>Off</strong></li></ul><ul class="help-list">${data.limits.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`)}${panel('League rules',`<div class="panel-body"><ul class="coverage-list">${Object.entries(data.rules).map(([k,v])=>`<li>${esc(({lineups:'Lineups',waivers:'Waivers',tradeDeadline:'Trade deadline',tradeReview:'Trade review',playoffs:'Playoffs',salaryCap:'Salary cap'})[k])}<strong>${esc(v===false?'None':v)}</strong></li>`).join('')}</ul><p class="sub section-gap">FP = PTS + 1.2 REB + 1.5 AST + 3 ST + 3 BLK − 1.5 TO.</p><p class="sub">Yahoo fantasy averages are kept as displayed. Rounded stat averages may not reproduce them exactly.</p><p class="sub">${publicLeague?'Yahoo snapshot is public. ESPN updates separately.':'League files stay in your browser session. ESPN updates separately.'}</p></div>`)}</div>`;}
function render(){if(!data)return;$('.sidebar-label').textContent=data.league;page=location.hash.slice(1)||'briefing';if(!titles[page])page='briefing';document.querySelectorAll('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===page);if(a.dataset.page===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#content').innerHTML=pageTop()+({briefing,lineup,waivers,matchup:weeklyMatchup,streaming,league,trades,coverage}[page])();document.title=`${titles[page]} / REAL BALLIGGAS`;$('#team-select').value=teamId;document.querySelectorAll('[data-width]').forEach(el=>{const width=Math.max(0,Math.min(100,Number(el.dataset.width)));el.style.width=width+'%';});if(page==='waivers')updateWaivers();if(page==='trades')updateActivity();bindControls();}
function bindControls(){
 $('#lineup-mode')?.addEventListener('change',e=>{lineupState.mode=e.target.value;render()});$('#include-q')?.addEventListener('change',e=>{lineupState.includeQ=e.target.checked;render()});
 const wa=[['#waiver-search','search','input'],['#waiver-pos','pos','change'],['#waiver-status','availability','change'],['#waiver-sort','sort','change']];for(const [sel,k,event]of wa)$(sel)?.addEventListener(event,e=>{waiverState[k]=e.target.value;waiverState.page=0;updateWaivers()});$('#waiver-healthy')?.addEventListener('change',e=>{waiverState.hideUnavailable=e.target.checked;waiverState.page=0;updateWaivers()});
 $('#roster-team')?.addEventListener('change',e=>{leagueState.roster=e.target.value;render()});
 for(const [sel,k,event]of [['#activity-search','search','input'],['#activity-team','team','change'],['#activity-action','action','change']])$(sel)?.addEventListener(event,e=>{activityState[k]=e.target.value;activityState.page=0;updateActivity()});
 $('#calculate-stream')?.addEventListener('click',()=>{const candidate=data.available.find(p=>p.name===$('#stream-add').value),drop=team().players.find(p=>p.name===$('#stream-drop').value);const ng=$('#stream-new-games').value,og=$('#stream-old-games').value,remain=teamId===data.ownerTeam?2:Number($('#stream-remaining').value);if(!candidate||!drop||ng===''||og===''||(teamId!==data.ownerTeam&&$('#stream-remaining').value==='')){$('#stream-result').innerHTML='<div class="error-box">Choose both players and enter the game counts.</div>';return;}const r=streamEstimate({candidate,drop,newGames:Number(ng),games:Number(og),adds:1,remaining:remain});$('#stream-result').innerHTML=r.error?`<div class="error-box">${esc(r.error)}</div>`:`<div class="result-box"><h3>Estimated difference</h3><strong class="${r.net<0?'negative':''}">${signed(r.net)} FP</strong><p>${esc(candidate.name)}: ${fmt(r.gained)} FP over ${ng} usable games.<br>${esc(drop.name)}: ${fmt(r.lost)} FP over ${og} usable games.</p><p>Season-average estimate · 1 add · ${remain-1} adds left.</p></div>`;});
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2500);}
function playerDetails(name){const p=[...data.teams.flatMap(t=>t.players),...data.available].find(p=>p.name===name);if(!p)return;const t=data.teams.find(t=>t.players.some(x=>x.name===name));$('#player-details').innerHTML=`<div class="eyebrow">${esc(t?.name||'Available player')}</div><h1>${esc(p.name)}</h1><p class="sub">${esc(p.nba)} · ${esc(p.positions.join(', '))} ${statusTag(p)}</p><div class="player-detail-stats">${[['FP / game',p.fpts],['Games played',p.gp],['Minutes',p.mpg],['Points',p.pts],['Rebounds',p.reb],['Assists',p.ast],['Steals',p.st],['Blocks',p.blk],['Turnovers',p.to]].map(([l,v])=>`<div>${l}<b>${typeof v==='string'?esc(v):fmt(v,l==='Games played'?0:1)}</b></div>`).join('')}</div><p class="sub">${p.availability?`Yahoo status: ${esc(p.availability)}. `:''}Season averages · captured Nov 18. ${p.pts===undefined?'Detailed scoring stats were not retained for this available player.':''}</p>`;$('#player-details').insertAdjacentHTML('beforeend',recentStats(p,data.publicFeed));$('#player-dialog').showModal();}
document.addEventListener('click',e=>{const p=e.target.closest('[data-player]');if(p)playerDetails(decodeURIComponent(p.dataset.player));const s=e.target.closest('[data-protect]');if(s){const n=decodeURIComponent(s.dataset.protect);if(protectedNames.has(n))protectedNames.delete(n);else protectedNames.add(n);try{localStorage.setItem('shohoku-protected',JSON.stringify([...protectedNames]))}catch{}render();toast(protectedNames.has(n)?'Protected from drop comparisons':'Protection removed');}const w=e.target.closest('[data-waiver-page]');if(w){waiverState.page+=Number(w.dataset.waiverPage);updateWaivers();}const a=e.target.closest('[data-activity-page]');if(a){activityState.page+=Number(a.dataset.activityPage);updateActivity();}const l=e.target.closest('[data-league-tab]');if(l){leagueState.tab=l.dataset.leagueTab;render();}const t=e.target.closest('[data-switch-team]');if(t){teamId=t.dataset.switchTeam;render();}if(e.target.closest('.close-dialog'))$('#player-dialog').close();});
const publicLeague=document.documentElement.hasAttribute('data-public-league');
$('#team-select').addEventListener('change',e=>{
 teamId=e.target.value;
 render();
});
window.addEventListener('hashchange',render);
$('#export').addEventListener('click',()=>{if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='big-balls-2026-11-18.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Snapshot exported');});
let publicFeed;
function acceptSnapshot(snapshot){
 if(!validateSnapshot(snapshot))throw new Error('Invalid league file');
 data=snapshot;if(publicFeed)data.publicFeed=publicFeed;teamId=data.manager?.teamId ?? (data.teams.some(t=>t.id===data.ownerTeam)?data.ownerTeam:data.teams[0].id);
 $('#manager-name').textContent=data.manager?.name ?? '';
 $('#manager-name').hidden=!data.manager;
 $('#sign-out').hidden=!data.manager;
 $('#team-select').innerHTML=data.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');render();
 $('#source-label').textContent='Yahoo snapshot · ESPN public games';
}
function welcome(){
 $('#source-label').textContent='ESPN · public NBA data';$('#team-select').innerHTML='<option>Open a league file</option>';
 $('#content').innerHTML=`<div class="page-top"><div><div class="eyebrow">REAL BALLIGGAS</div><h1>GAME PLAN</h1><p class="sub">Open your league snapshot to use the planners.</p></div></div>${panel('Your league','<div class="panel-body"><button class="button primary" id="welcome-import">Open league file</button><p class="sub">Choose the JSON exported from the local dashboard. It stays in this browser tab.</p></div>')}<div class="section-gap">${panel('NBA games',publicGames(publicFeed))}</div>`;
 $('#welcome-import').addEventListener('click',()=>$('#snapshot-file').click());
}
$('#import-snapshot').addEventListener('click',()=>$('#snapshot-file').click());
$('#snapshot-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>15000000)throw new Error('File too large');acceptSnapshot(JSON.parse(await file.text()));toast('League loaded');}catch{toast('Could not read this league file');}finally{e.target.value='';}});
async function loadPublicFeed(){try{let response=await fetch('./public-feed.json',{cache:'no-store'});if(!response.ok)response=await fetch('./api/public-feed',{cache:'no-store'});if(response.ok){const feed=await response.json();if(Array.isArray(feed.games)&&Array.isArray(feed.logs)){publicFeed=feed;if(data)data.publicFeed=feed;}}}catch{}}
await loadPublicFeed();
function showSignIn(){
 $('.top-actions').hidden=true;
 $('#content').innerHTML=`<section class="signin"><h1>Manager sign-in</h1><form id="sign-in-form" class="panel panel-body"><div class="field"><label for="username">Yahoo team name</label><input id="username" name="username" autocomplete="username" maxlength="80" required></div><div class="field"><label for="password">App password</label><input id="password" type="password" name="password" autocomplete="current-password" maxlength="128" required></div><button class="button primary" type="submit">Sign in</button><p id="sign-in-status" role="status"></p>${publicLeague?'<p class="sub">Sign in to open your team. League data is public.</p>':''}</form></section>`;
 $('#sign-in-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button'),status=$('#sign-in-status');
  button.disabled=true;
  status.textContent='';
  try {
   if(publicLeague){
    const fields=new FormData(form);
    const manager=await verifyPagesLogin(fields.get('username'),fields.get('password'));
    if(!manager){status.textContent='Check your Yahoo team name and app password.';return;}
    pagesManager=manager;
    try {sessionStorage.setItem('shohoku-manager',manager.teamId);} catch {}
    await loadLeague();
    return;
   }
   const response=await fetch('./api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
   if(response.ok){location.reload();return;}
   status.textContent=response.status===429?'Too many attempts. Try again in 15 minutes.':response.status===401?'Check your username and password.':'Sign-in is unavailable.';
  } catch {status.textContent='Could not reach the server.';}
  finally {button.disabled=false;}
 });
}
$('#sign-out').addEventListener('click',async ()=>{
 if(publicLeague){
  data=undefined;
  pagesManager=undefined;
  try {sessionStorage.removeItem('shohoku-manager');} catch {}
  showSignIn();
  return;
 }
 try {
  const response=await fetch('./api/logout',{method:'POST'});
  if(response.ok){location.reload();return;}
 } catch {}
 toast('Could not sign out. Try again.');
});
let pagesManager;
let managerRecords;
async function getManagerRecords(){
 if(managerRecords)return managerRecords;
 const response=await fetch('./manager-verifiers.json');
 if(!response.ok)throw new Error('Cannot load manager accounts');
 managerRecords=await response.json();
 return managerRecords;
}
const managerKey=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
async function verifyPagesLogin(username,password){
 const records=await getManagerRecords();
 const record=records.find(entry=>managerKey(entry.name)===managerKey(username));
 if(!record)return null;
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(record.salt),iterations:600000},key,256);
 const hash=Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
 return hash===record.hash?{teamId:record.teamId,name:record.name}:null;
}
async function loadLeague(){
 if(publicLeague&&!pagesManager){showSignIn();return;}
 try {
  const response=await fetch(publicLeague?'./public-league.json':'./api/snapshot');
  if(!publicLeague&&response.status===401){showSignIn();return;}
  if(!response.ok)throw new Error('League data unavailable');
  const snapshot=await response.json();
  if(publicLeague)snapshot.manager=pagesManager;
  acceptSnapshot(snapshot);
  $('.top-actions').hidden=false;
 } catch {
  if(publicLeague)$('#content').textContent='The league snapshot could not load. Please refresh the page.';
  else welcome();
 }
}
if(publicLeague){
 $('#import-snapshot').hidden=true;
 $('#team-select').title='Choose fantasy team';
 try {
  const saved=sessionStorage.getItem('shohoku-manager');
  if(saved){
   const record=(await getManagerRecords()).find(entry=>entry.teamId===saved);
   if(record)pagesManager={teamId:record.teamId,name:record.name};
  }
 } catch {}
}
await loadLeague();
setInterval(async()=>{await loadPublicFeed();if(data){if(!$('#player-dialog').open&&['briefing','matchup'].includes(page))render();}else if(pagesManager)await loadLeague();else if(!publicLeague&&!$('#sign-in-form'))welcome();},300000);
