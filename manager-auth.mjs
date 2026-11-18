import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const usernameKey=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function makeAccount(team,password){
 const salt=randomBytes(16).toString('hex');
 return {teamId:team.id,name:team.name,salt,hash:scryptSync(password,salt,32).toString('hex')};
}

export function managerAuth(file){
 const accounts=new Map(JSON.parse(readFileSync(file,'utf8')).map(a=>[usernameKey(a.name),a]));
 const sessions=new Map();
 const lifetime=8*60*60*1000;
 const window=15*60*1000;
 const attempts=new Map();
 const token=req=>/\bshohoku_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
 const cookie=value=>`shohoku_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?lifetime/1000:0}`;
 return {
  session(req){
   const session=sessions.get(token(req));
   if(!session||session.expires<=Date.now())return null;
   return session.manager;
  },
  logout(req){
   sessions.delete(token(req));
   return cookie('');
  },
  async login(req){
   const now=Date.now();
   for(const [key,value] of attempts)if(value.expires<=now)attempts.delete(key);
   for(const [key,value] of sessions)if(value.expires<=now)sessions.delete(key);
   const address=req.socket.remoteAddress;
   const limit=attempts.get(address)||{count:0,expires:now+window};
   if(limit.count>=12)return {status:429};
   limit.count++;
   attempts.set(address,limit);
   let body='';
   for await(const chunk of req){
    body+=chunk;
    if(body.length>4096)return {status:413};
   }
   let input;
   try {input=JSON.parse(body);} catch {return {status:400};}
   if(typeof input?.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>128)return {status:400};
   const account=accounts.get(usernameKey(input.username));
   const candidate=scryptSync(input.password,account?.salt||'unregistered',32);
   if(!timingSafeEqual(candidate,Buffer.from(account?.hash||'00'.repeat(32),'hex'))||!account)return {status:401};
   limit.count--;
   const id=randomBytes(32).toString('hex');
   sessions.delete(token(req));
   sessions.set(id,{expires:now+lifetime,manager:{teamId:account.teamId,name:account.name}});
   return {status:204,cookie:cookie(id)};
  }
 };
}
