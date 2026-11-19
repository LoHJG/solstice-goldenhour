function drawWatermark(dt){
  ctx.save(); ctx.scale(K,K);
  const wm=getMod('Watermark');
  wm.anim=clamp(animate(wm.on?1:0,wm.anim,dt*10),0,1);
  if(wm.anim<0.01){ ctx.restore(); return; }
  const layout=hudElement('Watermark',20,20,200,45);
  const px=lerp(layout.x-220,layout.x,wm.anim), py=lerp(layout.y-220,layout.y,wm.anim);

  const stS=wm.settings.find(s=>s.n==='Style');
  const style=stS?(stS.vals[stS.v]||'Solstice'):'Solstice';
  if(style==='7 Days'&&sevenImg&&sevenImg.complete&&sevenImg.naturalWidth){
    const w=sevenImg.naturalWidth, h=sevenImg.naturalHeight;
    hudSetSize('Watermark',w,h);
    if(wmGlow()) glowRect(px-10,py-10,w+20,h+20,0,[255,0,0],wm.anim*0.9,40);
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
