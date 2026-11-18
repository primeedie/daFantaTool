const choice=document.querySelector('#tool-choice');
const access=document.querySelector('#other-access');
const password=document.querySelector('#access-password');
const message=document.querySelector('#access-message');
const open=document.querySelector('#open-other');
const form=document.querySelector('#access-form');

function showAccess(){
 choice.hidden=true;
 access.hidden=false;
 password.focus();
}
open.addEventListener('click',showAccess);
document.querySelector('#back-to-choice').addEventListener('click',()=>{
 access.hidden=true;
 choice.hidden=false;
 password.value='';
 message.textContent='';
 open.focus();
});
if(new URLSearchParams(location.search).get('view')==='other')showAccess();

form.addEventListener('submit',async event=>{
 event.preventDefault();
 const button=form.querySelector('[type=submit]');
 button.disabled=true;
 message.textContent='';
 try {
  const response=await fetch('./entry-access.json');
  if(!response.ok)throw new Error('Password check unavailable');
  const {salt,hash,iterations}=await response.json();
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(password.value),'PBKDF2',false,['deriveBits']);
  const bytes=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations},key,256);
  const actual=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(actual!==hash){message.textContent='Wrong password.';return;}
  sessionStorage.setItem('real-balliggas-other','open');
  location.assign('./dashboard.html');
 } catch {
  message.textContent='Could not open the dashboard. Try again.';
 } finally {
  button.disabled=false;
 }
});
