const preferenceKey='real-balliggas-theme';
const paletteKey='real-balliggas-palette';
const palettes={
 nba:'NBA',bucks:'Bucks Cream City',bulls:'Bulls',cavs:'Cavs',celtics:'Celtics',
 clippers:'Clippers',grizzlies:'Grizzlies',hawks:'Hawks',hornets:'Hornets',jazz:'Jazz',kings:'Kings',
 knicks:'Knicks',lakers:'Lakers',magic:'Magic',mavs:'Mavs',heat:'Miami Vice',nets:'Nets',
 nuggets:'Nuggets',pacers:'Pacers',pelicans:'Pelicans',pistons:'Pistons',raptors:'Raptors',
 rockets:'Rockets Classic',sixers:'Sixers',spurs:'Spurs Fiesta',suns:'Suns',thunder:'Thunder',blazers:'Trail Blazers',
 warriors:'Warriors',wizards:'Wizards Cherry Blossom',wolves:'Wolves'
};
const root=document.documentElement;
document.body.insertAdjacentHTML('beforeend',`<svg class="brand-filters" width="0" height="0" aria-hidden="true" focusable="false">
 <defs><filter id="player-palette" color-interpolation-filters="sRGB">
  <feFlood flood-color="white" result="white"/>
  <feComposite in="white" in2="SourceAlpha" operator="in" result="silhouette"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 3.2 1.6 0 -3.55" result="paleDetails"/>
  <feComposite in="paleDetails" in2="SourceAlpha" operator="in" result="creaseMask"/>
  <feFlood flood-color="#33323e" result="shade"/>
  <feComposite in="shade" in2="creaseMask" operator="in" result="creases"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 -6 0 0 -1.8" result="redDetails"/>
  <feComposite in="redDetails" in2="SourceAlpha" operator="in" result="detailMask"/>
  <feFlood class="player-accent-fill" result="accent"/>
  <feComposite in="accent" in2="detailMask" operator="in" result="details"/>
  <feMerge><feMergeNode in="silhouette"/><feMergeNode in="creases"/><feMergeNode in="details"/></feMerge>
 </filter><filter id="wordmark-keyline" color-interpolation-filters="sRGB">
  <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="letterEdge"/>
  <feFlood class="wordmark-keyline-fill" result="edgeColor"/>
  <feComposite in="edgeColor" in2="letterEdge" operator="in" result="keyline"/>
  <feMerge><feMergeNode in="keyline"/><feMergeNode in="SourceGraphic"/></feMerge>
 </filter></defs>
</svg>`);
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
