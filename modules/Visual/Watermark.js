const sevenImg=new Image();
let sevenTimer=0;
let sevenGlowSprite=null;
let sevenGlowSize=0;
function loadSeven(){
  const src=document.documentElement?.getAttribute('data-solstice-seven')||'';
  if(src&&sevenImg.src!==src){
    sevenImg.src=src;
  }
}
sevenImg.addEventListener('load',()=>{
  if(sevenTimer){clearInterval(sevenTimer);sevenTimer=0;}
});
loadSeven();
sevenTimer=setInterval(loadSeven,500);

function sevenGlow(width){
  const radius=width*.525;
  const thickness=100;
  const outer=radius+thickness;
  const size=Math.ceil(outer*2+2);
  if(sevenGlowSprite&&sevenGlowSize===size){
    return sevenGlowSprite;
  }
  const canvas=document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const g=canvas.getContext('2d');
  const center=size/2;
  const edge=radius/outer;
  const gradient=g.createRadialGradient(center,center,0,center,center,outer);
  gradient.addColorStop(0,'rgba(255,0,0,.36)');
  gradient.addColorStop(edge,'rgba(255,0,0,.36)');
  gradient.addColorStop(edge+.1*(1-edge),'rgba(255,0,0,.28)');
  gradient.addColorStop(edge+.25*(1-edge),'rgba(255,0,0,.16)');
  gradient.addColorStop(edge+.5*(1-edge),'rgba(255,0,0,.06)');
  gradient.addColorStop(edge+.75*(1-edge),'rgba(255,0,0,.015)');
  gradient.addColorStop(1,'rgba(255,0,0,0)');
  g.fillStyle=gradient;
  g.beginPath();
  g.arc(center,center,outer,0,Math.PI*2);
  g.fill();
  sevenGlowSprite=canvas;
  sevenGlowSize=size;
  return canvas;
}

function drawWatermark(dt){
  ctx.save(); ctx.scale(K,K);
  const wm=getMod('Watermark');
  wm.anim=clamp(animate(wm.on?1:0,wm.anim,dt*10),0,1);
  if(wm.anim<0.01){ ctx.restore(); return; }
  const layout=hudElement('Watermark',20,20,200,45);
  const px=lerp(layout.x-220,layout.x,wm.anim), py=lerp(layout.y-220,layout.y,wm.anim);

  const stS=wm.settings.find(s=>s.n==='Style');
  const style=stS?(stS.vals[stS.v]||'Solstice'):'Solstice';
  if(style==='7 Days'){
    if(!sevenImg.complete||!sevenImg.naturalWidth){ loadSeven(); ctx.restore(); return; }
    const w=Math.max(1,Math.round(sevenImg.naturalWidth/10));
    const h=Math.max(1,Math.round(sevenImg.naturalHeight/10));
    hudSetSize('Watermark',w,h);
    if(wmGlow()){
      const glow=sevenGlow(w);
      const size=glow.width;
      ctx.globalAlpha=wm.anim;
      ctx.drawImage(glow,px+w/2-size/2,py+h/2-size/2,size,size);
      ctx.globalAlpha=1;
    }
    ctx.globalAlpha=wm.anim;
    ctx.drawImage(sevenImg,px,py,w,h);
    ctx.globalAlpha=1;
    ctx.restore();
    return;
  }

  const glowS=wm.settings.find(s=>s.n==='Glow');
  const glow=glowS?glowS.v===1:true;
  const text='solstice', size=45;
  const chars=[]; let x=px;
  setFont(size,true);
  for(let i=0;i<text.length;i++){
    const ch=text[i], c=themed(i*100);
    chars.push({ch,x,c,w:tw(ch,size,true)});
    x+=tw(ch,size,true);
  }
  if(glow){
    ctx.save();
    for(const q of chars){
      ctx.shadowColor=rgb(q.c,0.85*wm.anim); ctx.shadowBlur=size/3;
      ctx.fillStyle=rgb(q.c,0.9);
      ctx.fillText(q.ch,q.x,py);
    }
    ctx.restore();
  }
  hudSetSize('Watermark',x-px,size);
  for(const q of chars){
    ctx.fillStyle=rgb([q.c[0]*0.25,q.c[1]*0.25,q.c[2]*0.25],0.925);
    ctx.fillText(q.ch,q.x+3.25,py+3.25);
  }
  for(const q of chars){
    ctx.fillStyle=rgb(q.c,1);
    ctx.fillText(q.ch,q.x,py);
  }
  ctx.restore();
}
function wmGlow(){const s=getMod('Watermark').settings.find(x=>x.n==='Glow');return s?s.v===1:true;}

register({
  name:"Watermark",
  desc:"Displays a watermark on the screen",
  cat:"Visual",
  nm:{l:"watermark",ls:"watermark",n:"Watermark",ns:"Watermark"},
  disp:"Style",
  settings:[
    {t:"e",n:"Style",d:"The style of the watermark.",v:0,vals:["Solstice","7 Days"]},
    {t:"b",n:"Glow",d:"Enables glow",v:1}
  ],
  renderOrder:2,
  onRender:drawWatermark,
  defaultOn:true,
  onEnable(){}
});
