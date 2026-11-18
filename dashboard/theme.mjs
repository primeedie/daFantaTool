const preferenceKey='real-balliggas-theme';
const paletteKey='real-balliggas-palette';
const palettes={
 nba:'NBA',bucks:'Bucks',bulls:'Bulls',cavs:'Cavs',celtics:'Celtics',
 clippers:'Clippers',grizzlies:'Grizzlies',hawks:'Hawks',hornets:'Hornets',jazz:'Jazz',kings:'Kings',
 knicks:'Knicks',lakers:'Lakers',magic:'Magic',mavs:'Mavs',heat:'Miami Vice',nets:'Nets',
 nuggets:'Nuggets',pacers:'Pacers',pelicans:'Pelicans',pistons:'Pistons',raptors:'Raptors',
 rockets:'Rockets',sixers:'Sixers',spurs:'Spurs Fiesta',suns:'Suns',thunder:'Thunder',blazers:'Trail Blazers',
 warriors:'Warriors',wizards:'Wizards',wolves:'Wolves'
};
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
