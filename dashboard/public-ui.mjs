const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const playerKey=name=>name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\b(jr|iii|ii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
export function publicGames(feed){
 if(!feed?.games?.length)return '<div class="panel-body">Public data is not loaded yet.</div>';
 const finals=feed.games.filter(g=>g.completed).slice(-8).reverse();
 const upcoming=feed.games.filter(g=>!g.completed&&g.gameDate>=feed.nbaDate).slice(0,15);
 return `<div class="panel-body"><p class="sub">ESPN · updated ${esc(new Date(feed.updatedAt).toLocaleString())} · ${feed.logs.length.toLocaleString()} player logs${feed.partial?' · Some updates unavailable':''}</p></div><div class="table-wrap"><table><thead><tr><th>NBA date</th><th>Game</th><th>Score / Manila time</th><th>Status</th></tr></thead><tbody>${[...finals,...upcoming].map(g=>`<tr><td>${esc(g.gameDate)}</td><td>${esc(g.away)} @ ${esc(g.home)}</td><td>${g.completed?`${g.awayScore} – ${g.homeScore}`:esc(new Date(g.date).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</td><td><a href="${esc(g.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(g.status)}</a></td></tr>`).join('')}</tbody></table></div>`;
}
export function recentStats(player,feed){
 const logs=(feed?.logs||[]).filter(l=>l.key===playerKey(player.name)).sort((a,b)=>b.date.localeCompare(a.date));
 return `<div class="section-gap"><h2>Recent games</h2>${logs.length?`<div class="table-wrap"><table><thead><tr><th>NBA date</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>ST</th><th>BLK</th><th>TO</th><th>FP</th></tr></thead><tbody>${logs.slice(0,10).map(l=>`<tr><td><a href="${esc(l.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(l.gameDate)}</a></td>${['minutes','pts','reb','ast','st','blk','to','fpts'].map(k=>`<td>${esc(l[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="sub">ESPN · league scoring · final games</p>`:'<p class="sub">No matching game logs in the public feed.</p>'}</div>`;
}
export function validateSnapshot(s){
 const arrays=['teams','available','trades','matchups','transactions','draft','schedule','playingTeams','games','limits'];
 return !!s&&arrays.every(k=>Array.isArray(s[k]))&&!!s.rules&&s.teams.length>0&&s.teams.every(t=>typeof t.id==='string'&&Array.isArray(t.players)&&t.players.every(p=>Array.isArray(p.positions)));
}
