canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  const b=e.button===2?1:(e.button===1?2:0);
  S.mx=e.clientX; S.my=e.clientY;
  S.down[b]=true; S.clicked[b]=true;
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
});
window.addEventListener('pointermove',e=>{ S.mx=e.clientX; S.my=e.clientY; });
window.addEventListener('pointerup',e=>{
  const b=e.button===2?1:(e.button===1?2:0);
  S.down[b]=false; S.pickerDrag=null;
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const d=e.deltaY;
  S.wheel=d>0?1:(d<0?-1:0);
},{passive:false});

window.addEventListener('keydown',e=>{
  if(document.getElementById('solstice-root')&&!document.documentElement.hasAttribute('data-solstice-open')) return;
  if(e.key==='Insert'){
    e.preventDefault();
    if(!S.binding){ S.open=!S.open; S.wheel=0; killHint(); }
    return;
  }
  if(e.key==='Escape'){
    e.preventDefault();
    if(S.binding){ S.binding.key=0; window.Solstice?.saveModuleBind?.(S.binding); S.binding=null; return; }
    if(S.bindBool){ S.bindBool.key=0; S.bindBool=null; return; }
    if(S.picker){ S.picker=null; return; }
    if(S.open){ S.open=false; return; }
  }
  if(!S.binding&&!S.bindBool) return;
  const keys=window.SolsticeKeys;
  const bind=keys?keys.bindFromEvent(e):(e.code||e.key);
  if(keys&&keys.hasReservedModifier(bind)){
    console.warn('[Solstice] Ctrl / Alt / Win combos are browser hotkeys - bind a plain key, Shift combo or Mouse4 / Mouse5.');
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  if(S.binding){ S.binding.key=bind; window.Solstice?.saveModuleBind?.(S.binding); S.binding=null; }
  else if(S.bindBool){ S.bindBool.key=bind; S.bindBool=null; }
});

window.addEventListener('mousedown',e=>{
  if(!S.binding&&!S.bindBool) return;
  const keys=window.SolsticeKeys;
  const bind=keys?keys.mouseBindFromEvent(e):'';
  if(!bind) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(S.binding){ S.binding.key=bind; window.Solstice?.saveModuleBind?.(S.binding); S.binding=null; }
  else if(S.bindBool){ S.bindBool.key=bind; S.bindBool=null; }
},true);
window.addEventListener('blur',()=>{ S.down=[false,false,false]; S.dragSetting=null; });

function killHint(){
  if(S.hintKilled) return;
  S.hintKilled=true;
  const h=document.getElementById('hint');
  if(h) h.classList.add('gone');
}
const hintEl=document.getElementById('hint');
if(hintEl){
  hintEl.addEventListener('click',()=>{ if(matchMedia('(pointer:coarse)').matches){ S.open=!S.open; } });
  setTimeout(killHint,11000);
}

let lastTs=0;
function frame(ts){
  NOW_MS=ts;
  let dt=(ts-lastTs)/1000; lastTs=ts;
  if(!isFinite(dt)||dt<=0) dt=0.016;
  dt=Math.min(dt,0.05);

  const e=S.ease;
  if(S.open) e.inc(dt*18/10); else e.dec(dt*2*18/10);

  const animMode=(getMod('ClickGui').settings.find(s=>s.n==='Animation')||{v:1}).v;
  let inScale=animMode===1?(S.open?e.outElastic():e.outBack()):clamp(e.outExpo(),0,0.996);
  if(e.p>=1) inScale=0.996;
  S.anim=lerp(0,1,e.outExpo());
  S.inScale=inScale;

  const a=S.anim, s=Math.max(0.0001,inScale*K);
  getMod('ClickGui').on=S.open;

  ctx.clearRect(0,0,W,H);
  RENDER_MODS.forEach(m=>m.onRender(dt));

  S.clicked=[false,false,false];
  S.wheel=0;
  if(!S.down[0]&&!S.down[2]) S.dragSetting=null;
  MODS.forEach(m=>{m.__clicked=false;});

  requestAnimationFrame(frame);
}

buildModules();
resize();
requestAnimationFrame(frame);
