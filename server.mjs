import http from 'node:http';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const privateDir=process.env.FANTASY_DATA_DIR || resolve(root,'../../data/private');
const numeric=['gp','pts','reb','ast','st','blk','to','fpts'];
function psv(file){
  const [header,...lines]=readFileSync(resolve(privateDir,file),'utf8').trim().split(/\r?\n/);
  const keys=header.split('|');
  return lines.filter(Boolean).map((line,i)=>{
    const cells=line.split('|');
    if(cells.length!==keys.length)throw new Error(`${file}:${i+2}: invalid column count`);
    return Object.fromEntries(keys.map((k,j)=>[k,cells[j]]));
  });
}
function player(p){
  for(const k of numeric)if(k in p)p[k]=p[k]==='-'||p[k]===''?null:Number(p[k]);
  p.positions=p.positions.split(',');
  return p;
}
function loadData(){
  const meta=JSON.parse(readFileSync(resolve(privateDir,'league.json'),'utf8'));
  const rosters=psv('rosters.psv').map(player);
  const available=psv('available.psv').map(player);
  const {patterns}=JSON.parse(readFileSync(resolve(privateDir,'available-tail.json'),'utf8'));
  for(const row of psv('available-tail.psv')){
    const suffix=patterns[Number(row.pattern)];
    if(!suffix)throw new Error('Invalid available-player pattern');
    const [availability,gp,fpts,rostered,mpg,pts,reb,ast,st,blk,to]=suffix.split('|');
    const {pattern,...base}=row;
    available.push(player({...base,availability,gp,fpts,rostered,mpg,pts,reb,ast,st,blk,to}));
  }
  const transactions=psv('transactions.psv');
  const draft=psv('draft.psv').map(p=>({...p,pick:Number(p.pick)})).sort((a,b)=>a.pick-b.pick);
  const teams=meta.teams.map(t=>({...t,players:rosters.filter(p=>p.team_id===t.id)}));
  if(teams.some(t=>t.players.length<10))throw new Error('A team roster is missing');
  if(available.length!==597||transactions.length!==132||draft.length!==130)throw new Error(`Incomplete snapshot: ${available.length} available, ${transactions.length} transactions, ${draft.length} draft picks`);
  if(new Set([...rosters,...available].map(p=>p.name)).size!==rosters.length+available.length)throw new Error('Duplicate player in snapshot');
  const recentGames=JSON.parse(readFileSync(resolve(privateDir,'recent-games.json'),'utf8'));
  let publicFeed=null,refreshStatus=null;
  try{publicFeed=JSON.parse(readFileSync(resolve(privateDir,'public-feed.json'),'utf8'));delete publicFeed.boxCache;}catch{}
  try{refreshStatus=JSON.parse(readFileSync(resolve(privateDir,'public-refresh-status.json'),'utf8'));}catch{}
  return {...meta,teams,available,transactions,draft,recentGames,publicFeed,refreshStatus};
}
if(process.argv.includes('--export-snapshot')){
 const file=resolve(privateDir,'league-snapshot.json');const data=loadData();delete data.publicFeed;delete data.refreshStatus;writeFileSync(file,JSON.stringify(data));console.log('Saved local league-snapshot.json');
}else if(process.argv.includes('--check-data')){
  const d=loadData();console.log(JSON.stringify({teams:d.teams.length,rostered:d.teams.reduce((n,t)=>n+t.players.length,0),available:d.available.length,transactions:d.transactions.length,draft:d.draft.length}));
}else{
  const files={'/':'dashboard/index.html','/app.js':'dashboard/app.js','/style.css':'dashboard/style.css','/font.css':'dashboard/font.css','/model.mjs':'dashboard/model.mjs','/public-ui.mjs':'dashboard/public-ui.mjs'};
  const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
  const server=http.createServer((req,res)=>{
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost):4173$/.test(host)){res.writeHead(403);res.end('Local access only');return;}
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"};
    if(req.method!=='GET'){res.writeHead(405,headers);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1:4173');
    try{
      if(url.pathname==='/api/public-feed'){const feed=JSON.parse(readFileSync(resolve(privateDir,'public-feed.json'),'utf8'));delete feed.boxCache;res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(feed));return;}
      if(url.pathname==='/api/snapshot'){res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(loadData()));return;}
      if(url.pathname==='/fonts/slam-dunk.otf'){
        const font=resolve(root,'dashboard/fonts/slam-dunk.otf');
        if(!existsSync(font)){res.writeHead(404,headers);res.end();return;}
        res.writeHead(200,{...headers,'Content-Type':'font/otf'});res.end(readFileSync(font));return;
      }
      const path=files[url.pathname];
      if(!path){res.writeHead(404,headers);res.end('Not found');return;}
      const data=readFileSync(resolve(root,path));
      res.writeHead(200,{...headers,'Content-Type':mime[path.split('.').at(-1)]});res.end(data);
    }catch{res.writeHead(500,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({error:'Could not load the local snapshot. Run npm run check for details.'}));}
  });
  server.listen(4173,'127.0.0.1',()=>console.log('Shohoku dashboard: http://127.0.0.1:4173'));
}
