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
    drawSevenDaysWatermark(px,py,layout,wm.anim);
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

/* 7 Days 风格：纯 canvas 复刻的白色铭牌，不依赖任何外部图片资源 */
function drawSevenDaysWatermark(px,py,layout,a){
  const label='7DAYS';
  const size=30;
  setFont(size,true);
  const textW=tw(label,size,true);
  const padX=13, padY=7;
  const w=Math.ceil(textW+padX*2), h=Math.ceil(size+padY*2);

  hudSetSize('Watermark',w,h);

  ctx.save();
  ctx.shadowColor=`rgba(0,0,0,${(0.45*a).toFixed(3)})`;
  ctx.shadowBlur=12;
  ctx.shadowOffsetY=2;
  fillRR(px,py,w,h,4,[247,247,249],0.95*a,CORNER_TOP|CORNER_BOTTOM);
  ctx.restore();

  /* 左侧红色竖条 + 底部下划线 */
  fillRR(px+padX,py+padY+2,3,size-4,1,[232,58,72],a,CORNER_TOP|CORNER_BOTTOM);
  fillRR(px+padX,py+h-6,textW*0.32,2,0,[232,58,72],a,0);

  text(px+padX+9,py+padY-1,label,[20,20,24],a,false,true,size);

  /* 右上角的细描边，避免大白块糊成一片 */
  ctx.save();
  ctx.strokeStyle=`rgba(12,12,16,${(0.12*a).toFixed(3)})`;
  ctx.lineWidth=1;
  rrPath(px+0.5,py+0.5,w-1,h-1,4,CORNER_TOP|CORNER_BOTTOM);
  ctx.stroke();
  ctx.restore();
}

register({
  name:"Watermark",
  desc:"Displays a watermark on the screen",
  cat:"Visual",
  nm:{l:"watermark",ls:"water mark",n:"Watermark",ns:"Watermark"},
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
