import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent,normalizeBox,nameKey,fantasyPoints} from '../public-feed.mjs';
import {validateSnapshot,publicGames,recentStats} from '../dashboard/public-ui.mjs';
test('scores preserve missing values and normalize team abbreviations',()=>{
 const event=normalizeEvent({id:'123',date:'2026-11-18T00:00Z',competitions:[{competitors:[{homeAway:'home',team:{abbreviation:'NY'}},{homeAway:'away',team:{abbreviation:'SA'},score:'0'}]}]},'2026-11-17');
 assert.equal(event.home,'NYK');assert.equal(event.away,'SAS');assert.equal(event.homeScore,null);assert.equal(event.awayScore,0);assert.equal(event.completed,false);
 assert.equal(normalizeEvent({},'2026-11-17'),null);
});
test('box scores match labels and skip DNP or incomplete rows',()=>{
 const row={athlete:{displayName:'Nikola Jokić',id:'1'},stats:['1','3','2','10','4','5','30']};
 const summary={boxscore:{players:[{team:{abbreviation:'DEN'},statistics:[{labels:['TO','BLK','STL','PTS','AST','REB','MIN'],athletes:[row,{...row,didNotPlay:true},{...row,stats:['1']}]}]}]}};
 const logs=normalizeBox(summary,{id:'1',date:'2026-11-18T00:00Z',gameDate:'2026-11-17'});
 assert.equal(logs.length,1);assert.equal(logs[0].key,nameKey('Nikola Jokic'));assert.equal(logs[0].fpts,35.5);
 assert.equal(fantasyPoints({pts:10,reb:5,ast:4,st:2,blk:3,to:1}),35.5);
});
test('public UI escapes names and rejects incomplete league imports',()=>{
 assert.equal(validateSnapshot({teams:[]}),false);
 const feed={updatedAt:'2026-11-18T00:00Z',nbaDate:'2026-11-17',logs:[],games:[{date:'2026-11-18T00:00Z',gameDate:'2026-11-17',home:'<script>',away:'NYK',status:'Scheduled'}]};
 assert.ok(!publicGames(feed).includes('<script>'));assert.ok(recentStats({name:'Unknown'},feed).includes('No matching'));
});
