const preferenceKey='real-balliggas-theme';
const root=document.documentElement;
const toggles=document.querySelectorAll('[data-theme-toggle]');
let theme;
try {theme=localStorage.getItem(preferenceKey);} catch {}
if(theme!=='light'&&theme!=='dark')theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
function apply(){
 root.dataset.theme=theme;
 for(const button of toggles)button.textContent=theme==='dark'?'Light mode':'Dark mode';
}
apply();
for(const button of toggles)button.addEventListener('click',()=>{
 theme=theme==='dark'?'light':'dark';
 try {localStorage.setItem(preferenceKey,theme);} catch {}
 apply();
});
