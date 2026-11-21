const sky = document.querySelector("#stars");
const ctx = sky.getContext("2d");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let width=1,height=1,stars=[],frame=0,last=0,time=0;

function resize() {
  width=sky.clientWidth; height=sky.clientHeight;
  const dpr=Math.min(1.6,devicePixelRatio);
  sky.width=Math.round(width*dpr); sky.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  let seed=279164196;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const count=Math.min(176,Math.max(65,Math.round(width*height/7200)));
  stars=Array.from({length:count},()=>{
    const depth=random();
    return {x:random(),y:random(),depth,r:.55+depth**2*1.25,phase:random()*6.28,tint:random()};
  });
  draw();
}
function draw() {
  ctx.clearRect(0,0,width,height);
  for(const star of stars) {
    const speed=2+star.depth**2*12;
    const x=(star.x*width+time*speed) % (width+8)-4;
    const y=(star.y*height+time*speed*.27) % (height+8)-4;
    const glow=.48+.34*Math.sin(time*(.58+star.depth*.25)+star.phase);
    ctx.globalAlpha=glow;
    ctx.fillStyle=star.tint<.25?"#ffd1b3":star.tint>.76?"#acdcff":"#ded5ff";
    ctx.beginPath();ctx.arc(x,y,star.r,0,Math.PI*2);ctx.fill();
    if(star.depth>.94) {
      ctx.globalAlpha=glow*.45;
      ctx.fillRect(x-star.r*2.8,y-.45,star.r*5.6,.9);
      ctx.fillRect(x-.45,y-star.r*2.8,.9,star.r*5.6);
    }
  }
  // Each brief meteor crosses a different part of the same sky.
  const cycle=Math.floor((time+4)/10), age=(time+4)%10;
  if(!reduced.matches && age<1.3) {
    const u=age/1.3, span=Math.min(width*.47,480);
    const x=width*(.08+(cycle*.381)% .49)+u*span;
    const y=height*(.12+(cycle*.223)% .57)+u*span*.31;
    const tail=span*.23;
    ctx.globalAlpha=Math.sin(Math.PI*u)*.88;
    const trail=ctx.createLinearGradient(x-tail,y-tail*.31,x,y);
    trail.addColorStop(0,"#b9acff00");trail.addColorStop(.78,"#cabfffa0");trail.addColorStop(1,"#fff0df");
    ctx.strokeStyle=trail;ctx.lineWidth=1.35;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(x-tail,y-tail*.31);ctx.lineTo(x,y);ctx.stroke();
    ctx.fillStyle="#ffe2bf";ctx.beginPath();ctx.arc(x,y,1.6,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}
function tick(now) {
  frame=0;
  if(document.hidden) return;
  if(reduced.matches) {draw(); return;}
  if(!last || now-last>=1000/30-1) {
    time+=last ? Math.min((now-last)/1000,.12) : 0;
    last=now; draw();
  }
  frame=requestAnimationFrame(tick);
}
function resume() {
  cancelAnimationFrame(frame);last=0;
  if(!document.hidden && !reduced.matches) frame=requestAnimationFrame(tick);
  else draw();
}
window.addEventListener("resize",resize);
document.addEventListener("visibilitychange",resume);
reduced.addEventListener("change",resume);
resize(); resume();
