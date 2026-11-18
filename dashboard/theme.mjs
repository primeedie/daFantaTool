const preferenceKey='real-balliggas-theme';
const paletteKey='real-balliggas-palette';
const palettes={nba:'NBA',lakers:'Lakers',sixers:'Sixers',spurs:'Spurs',celtics:'Celtics'};
const root=document.documentElement;
const toggles=document.querySelectorAll('[data-theme-toggle]');
let theme,palette;
try {theme=localStorage.getItem(preferenceKey);palette=localStorage.getItem(paletteKey);} catch {}
if(theme!=='light'&&theme!=='dark')theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
if(!Object.hasOwn(palettes,palette))palette='nba';
root.dataset.palette=palette;
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
for(const button of toggles){
 const controls=document.createElement('div');
 controls.className='theme-controls';
 button.before(controls);
 const select=document.createElement('select');
 select.setAttribute('aria-label','Team palette');
 for(const [value,name] of Object.entries(palettes)){
  const option=document.createElement('option');
  option.value=value;
  option.textContent=name;
  select.append(option);
 }
 select.value=palette;
 select.addEventListener('change',()=>{
  root.dataset.palette=select.value;
  try {localStorage.setItem(paletteKey,select.value);} catch {}
 });
 controls.append(select,button);
}
