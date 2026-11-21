// The hot core stays attached to the mouth. Detached flame and embers keep their world positions.
export function createBreath(canvas) {
  const ctx = canvas.getContext("2d");
  const clouds = [], sparks = [];
  let width=0, height=0, carry=0, time=0;
  function puff(colors) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 72;
    const c = tile.getContext("2d"), glow = c.createRadialGradient(36,36,0,36,36,35);
    colors.forEach(([offset,color])=>glow.addColorStop(offset,color));
    c.fillStyle=glow; c.fillRect(0,0,72,72);
    return tile;
  }
  const white = puff([[0,"#ffffd4"],[.23,"#fff09f"],[.48,"#ffab38da"],[.8,"#fd68274a"],[1,"#f34c0b00"]]);
  const amber = puff([[0,"#ffe493f0"],[.29,"#ffb443e8"],[.53,"#ff682db5"],[.82,"#d949372d"],[1,"#932a3400"]]);
  const smoke = puff([[0,"#87506760"],[.52,"#6b415749"],[1,"#3b2e5100"]]);

  function resize(w,h) {
    width=w; height=h;
    const ratio=Math.min(devicePixelRatio,1.6);
    canvas.width=Math.round(w*ratio); canvas.height=Math.round(h*ratio);
    ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
  }
  function clear() { clouds.length=sparks.length=0; carry=0; ctx.clearRect(0,0,width,height); }
  function launch(m, size) {
    const spread=(Math.random()-.5)*.30;
    const nx=m.dx*Math.cos(spread)-m.dy*Math.sin(spread);
    const ny=m.dy*Math.cos(spread)+m.dx*Math.sin(spread);
    const velocity=size*(1.7+Math.random()*.95);
    const bit={x:m.x,y:m.y+scrollY,vx:nx*velocity,vy:ny*velocity,age:0,
      life:.40+Math.random()*.33,r:size*(.026+.032*Math.random()),seed:Math.random()*6.28};
    clouds.push(bit);
    if (Math.random()<.42) sparks.push({...bit,vy:bit.vy+(Math.random()-.5)*size*.65,life:.38+Math.random()*.56,r:Math.max(.8,size*.005)});
  }
  function core(m, size, strength) {
    ctx.save(); ctx.translate(m.x,m.y); ctx.rotate(Math.atan2(m.dy,m.dx));
    const reach=size*(.31+.035*Math.sin(time*27)+.021*Math.sin(time*42))*strength;
    const r=size*.023*strength;
    const grad=ctx.createLinearGradient(0,0,Math.max(1,reach),0);
    grad.addColorStop(0,"#ffffdcec"); grad.addColorStop(.32,"#ffe79cef"); grad.addColorStop(.72,"#ff923d9e"); grad.addColorStop(1,"#ff592900");
    const center=k=>Math.sin(time*20-k*6)*k*r*1.6+Math.sin(time*31-k*9)*k*r*.7;
    const radius=k=>r*(.3+1.7*Math.sin(Math.PI*k))*(1+.21*Math.sin(time*40-k*12));
    ctx.fillStyle=grad; ctx.beginPath();
    for (let i=0;i<=16;i++) { const k=i/16;ctx.lineTo(k*reach,center(k)-radius(k)); }
    for (let i=16;i>=0;i--) { const k=i/16;ctx.lineTo(k*reach,center(k)+radius(k)); }
    ctx.closePath();ctx.fill();
    ctx.drawImage(white,-r*2.2,-r*2.2,r*4.4,r*4.4);
    ctx.restore();
  }
  function draw(dt, mouth, size, strength) {
    time+=dt; ctx.clearRect(0,0,width,height);
    carry+=dt*115*strength;
    while(carry>=1 && clouds.length<205) {launch(mouth,size);carry--;}
    carry=Math.min(carry,1);
    for (let i=clouds.length-1;i>=0;i--) {
      const b=clouds[i]; b.age+=dt;
      if(b.age>=b.life) {clouds.splice(i,1);continue;}
      const k=b.age/b.life, drag=Math.exp(-1.8*dt);
      b.vx*=drag; b.vy=b.vy*drag-size*.43*dt;
      b.x+=b.vx*dt; b.y+=b.vy*dt;
      const wobble=Math.sin(b.seed+b.age*15)*b.r*k;
      const r=b.r*(.22+3.6*k);
      ctx.globalCompositeOperation=k>.70?"source-over":"lighter";
      ctx.globalAlpha=(k>.70?.45:.85)*(1-k*k);
      ctx.drawImage(k<.18?white:k<.70?amber:smoke,b.x-r+wobble,b.y-scrollY-r,r*2,r*2);
    }
    ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=1;
    if(strength>.02) core(mouth,size,strength);
    ctx.lineCap="round";
    for(let i=sparks.length-1;i>=0;i--) {
      const s=sparks[i];s.age+=dt;
      if(s.age>=s.life) {sparks.splice(i,1);continue;}
      s.vy-=size*.34*dt;s.vx*=Math.exp(-1.35*dt);
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      ctx.globalAlpha=1-s.age/s.life; ctx.strokeStyle="#ffcd89";ctx.lineWidth=s.r;
      ctx.beginPath();ctx.moveTo(s.x,s.y-scrollY);ctx.lineTo(s.x-s.vx*.012,s.y-scrollY-s.vy*.012);ctx.stroke();
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
  }
  return { resize, clear, draw };
}
