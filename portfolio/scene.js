import { createWingRig } from "./wing-rig.js";
import { planEdgeTurn, advanceEdgeTurn } from "./flight-turn.js";
import { createBreath } from "./fire.js";

export function startFlight(root, heroElement, assetURL = name => name) {
  const lifecycle = new AbortController();
  const events = { signal:lifecycle.signal };
  const flight = root.querySelector("#flight");
  const dragon = root.querySelector("#creature");
  const rigCanvas = root.querySelector("#rig");
  const texture = root.querySelector("#texture");
  const body = dragon.querySelector(".dragon-body");
  const sidePose = dragon.querySelector(".side-pose");
  function loadPose(filename) {
    const image=new Image();
    const layer=document.createElement("span");
    layer.className="turn-pose";
    image.alt=""; image.draggable=false;
    image.src=assetURL(filename);
    layer.append(image);body.append(layer);
    return layer;
  }
  const quarterPose=loadPose("bank-quarter.webp"), frontPose=loadPose("bank-front.webp");
  const turnTextures=[quarterPose.firstElementChild,frontPose.firstElementChild];
  const fire = root.querySelector("#fire");
  const land = root.querySelector("#land");
  const help = root.querySelector("#help");
  const guide = root.querySelector("#guide");
  const effects = createBreath(root.querySelector("#effects"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const keys = new Set();
  const directions = {ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0],
    ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1]};
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi,value));
  const blend = (rate,dt) => 1-Math.exp(-rate*dt);
  let width=1,height=1,size=180,x,y,vx=0,vy=0,face=-1,heading=Math.PI,headingRate=0,roll=0,pitch=0,phase=0,heat=0;
  let turn=null, lastPreference=reduced.matches;
  let placed=false, wingLoad=.85, dockBounds, pitchRate=0, tailLean=0;
  let active=!reduced.matches, drag=null, rig=null, frame=0, previous=0, elapsed=0, idle=0;
  let burst=0, firePointer=null, space=false, demo=!reduced.matches, helpTime=7;
  let orbitAngle=null, orbitDirection=1;

  // Fixed screen coordinates keep the dragon within reach at every scroll position.
  // Edge steering advances the document underneath it, including during a continuous touch drag.
  function resize() {
    const oldW=width,oldH=height;
    if(lifecycle.signal.aborted) return;
    width=document.documentElement.clientWidth; height=flight.clientHeight;
    size=parseFloat(getComputedStyle(dragon).width);
    if (!Number.isFinite(size)) size=clamp(width*.26,150,360);
    if (x===undefined) {
      const hero=heroElement?.getBoundingClientRect() ?? {right:width*.9,top:0,width:width*.75};
      x=clamp(hero.right-size*.46,size*.43,width-size*.43);
      y=clamp(hero.top+hero.width*.336*.58,60,height*.45);
    } else {
      x*=width/oldW; y*=height/oldH;
    }
    const ratio=Math.min(2,devicePixelRatio);
    rigCanvas.width=Math.round(size*1.22*ratio);rigCanvas.height=Math.round(size*.5*1.64*ratio);
    dockBounds=land.parentElement.getBoundingClientRect();
    turn=null; effects.resize(width,height);
    if(drag) positionInHand();
    else if(placed) placeAt(x,y);
    else constrain(flightArea());
    paint(0); request();
  }
  function flightArea() {
    const mx=Math.min(size*.43,width*.35), my=Math.min(size*.23,height*.27);
    return {left:mx,right:width-mx,top:my,bottom:Math.max(my,height-my-64)};
  }
  function constrain(box) {
    x=clamp(x,box.left,box.right); y=clamp(y,box.top,box.bottom);
  }
  function placeAt(px,py) {
    // Let the player reach the edges, while keeping a patch large enough to pick up again.
    const margin=Math.min(24,size*.14);
    x=clamp(px,margin,width-margin); y=clamp(py,margin,height-margin);
    const dock=dockBounds;
    if(x>=dock.left-margin && y>=dock.top-margin && x<=dock.right+margin && y<=dock.bottom+margin) {
      const left=dock.left-margin, top=dock.top-margin;
      if(left>margin && x-left<y-top) x=left;
      else y=top;
    }
  }
  function moveBody() {
    dragon.style.transform='translate3d('+(x-size/2)+'px,'+(y-size/4)+'px,0)';
  }
  function positionInHand() {
    placeAt(drag.px-drag.ox,drag.py-drag.oy);
    moveBody();
  }
  function request() {
    if(!frame && active && !document.hidden) frame=requestAnimationFrame(tick);
  }
  function nearEdge(coordinate,margin) {
    if(coordinate<margin) return -clamp((margin-coordinate)/margin,0,1);
    if(coordinate>height-margin) return clamp((coordinate-(height-margin))/margin,0,1);
    return 0;
  }
  function pan(edge,dt) {
    if(!edge) return;
    const max=document.documentElement.scrollHeight-height;
    const next=clamp(scrollY+Math.sign(edge)*Math.pow(Math.abs(edge),1.3)*Math.min(970,height*1.38)*dt,0,Math.max(0,max));
    if (Math.abs(next-scrollY)>.5) window.scrollTo({top:next,behavior:"instant"});
  }
  // Exact critically damped spring keeps tracking consistent at different frame rates.
  function follow(position,velocity,goal,dt,omega=24) {
    const delta=position-goal, spring=velocity+omega*delta, decay=Math.exp(-omega*dt);
    return [goal+(delta+spring*dt)*decay,(velocity-omega*spring*dt)*decay];
  }
  function cruise(box,dt) {
    // Join the nearest part of the orbit, then steer along its tangent.
    const cx=(box.left+box.right)/2, cy=box.top+(box.bottom-box.top)*.44;
    const rx=Math.max(1,(box.right-box.left)*.40), ry=Math.max(1,(box.bottom-box.top)*.28);
    if(orbitAngle===null) {
      orbitAngle=Math.atan2((y-cy)/ry,(x-cx)/rx);
      const forward=Math.hypot(vx,vy)>20 ? vx : face*30;
      orbitDirection=(-rx*Math.sin(orbitAngle)*forward+ry*Math.cos(orbitAngle)*vy)<0 ? -1 : 1;
    }
    const speed=Math.min(145,width*.25);
    const angularSpeed=orbitDirection*Math.min(.63,speed/Math.hypot(rx*Math.sin(orbitAngle),ry*Math.cos(orbitAngle)));
    orbitAngle+=angularSpeed*dt;
    const c=Math.cos(orbitAngle),s=Math.sin(orbitAngle);
    const targetX=-rx*s*angularSpeed+clamp(cx+rx*c-x,-speed,speed);
    const targetY= ry*c*angularSpeed+clamp(cy+ry*s-y,-speed*.65,speed*.65);
    vx+=(targetX-vx)*blend(1.85,dt);
    vy+=(targetY-vy)*blend(1.85,dt);
  }
  function steer(dt) {
    let kx=0,ky=0;
    for(const key of keys) {kx+=directions[key][0];ky+=directions[key][1];}
    const box=flightArea();
    // Up/down input is also how the player travels between profile sections.
    const cameraMoving=ky<0 && scrollY>1 || ky>0 && scrollY+height<document.documentElement.scrollHeight-1;
    // A flick released partly over an edge starts there and banks back into the normal flight area.
    box.left=Math.min(box.left,x); box.right=Math.max(box.right,x);
    box.top=Math.min(box.top,y); box.bottom=Math.max(box.bottom,y);
    if(!drag && !placed && !turn && !cameraMoving) turn=planEdgeTurn(x,y,vx,vy,box,size);
    const banking=Boolean(turn);
    if(banking || drag || keys.size || placed || idle<=3.2) orbitAngle=null;
    if(turn) {
      const next=advanceEdgeTurn(turn,dt);
      x=next.x; y=next.y; vx=next.vx; vy=next.vy;
      if(next.done) {turn=null;idle=0;}
    } else if(drag) {
      // Pointer events own the position. Velocity only steers the pose while held.
      if(performance.now()-drag.lastMove>65) {vx*=Math.exp(-dt*20);vy*=Math.exp(-dt*20);}
      if(drag.moved) pan(nearEdge(drag.py,Math.min(96,height*.16)),dt);
      idle=0;
    } else if(kx || ky) {
      const norm=Math.hypot(kx,ky), speed=Math.min(570,width*1.13);
      vx+=(kx/norm*speed-vx)*blend(9,dt); vy+=(ky/norm*speed-vy)*blend(9,dt);
      x+=vx*dt;y+=vy*dt;
      if(ky) pan(nearEdge(y,Math.min(height*.35,size*.24+160)),dt);
      idle=0;
    } else {
      idle+=dt;
      if(!placed && idle>3.2 && !reduced.matches) {
        cruise(box,dt);
      } else if(!placed) {
        // Trade forward momentum for a shallow descent. A gentle drop stays anchored.
        const airspeed=Math.hypot(vx,vy);
        const sink=clamp(Math.abs(vx)*.14,0,38);
        vx*=Math.exp(-(1.04+airspeed/1750)*dt);
        vy+=(sink-vy)*blend(1.7,dt);
      }
      x+=vx*dt;y+=vy*dt;
    }
    const speed=Math.hypot(vx,vy);
    if(Math.abs(vx)>18) face=Math.sign(vx);
    let desiredHeading=face>0 ? 0 : Math.PI;
    if(drag && speed<36) {
      if(x-box.left<7 && face<0) desiredHeading=Math.PI*.61;
      if(box.right-x<7 && face>0) desiredHeading=Math.PI*.39;
    }
    if(speed>24 || (banking && speed>9)) {
      const vertical=vy*(banking?1:.68);
      desiredHeading=Math.acos(clamp(vx/Math.max(1,Math.hypot(vx,vertical)),-1,1));
    }
    [heading,headingRate]=follow(heading,headingRate,desiredHeading,dt,7.2);
    heading=clamp(heading,0,Math.PI);
    const targetPitch=clamp(Math.atan2(vy,Math.max(65,Math.abs(vx))),-.85,.78);
    [pitch,pitchRate]=follow(pitch,pitchRate,targetPitch,dt,8);
    roll+=(-clamp(headingRate*.16,-.66,.66)-roll)*blend(7,dt);
    tailLean+=(clamp(pitchRate*.18+roll*.54,-.7,.7)-tailLean)*blend(3.8,dt);
    if(!drag && !placed) constrain(box);
  }
  function smooth(a,b,v) {
    const t=clamp((v-a)/(b-a),0,1);
    return t*t*(3-2*t);
  }
  function paint(dt) {
    if(!Number.isFinite(x)) return;
    const pace=Math.min(1,Math.hypot(vx,vy)/520);
    const yaw=Math.cos(heading), extent=Math.abs(yaw), sign=yaw<0?-1:1;
    const bank=clamp(Math.sin(pitch)*yaw+roll,-1,1);
    const climb=clamp(-vy/370,0,1);
    const glide=!drag && !placed && !keys.size
      ? smooth(.055,.32,pace)*(1-smooth(.06,.52,climb))*(1-smooth(.15,.6,Math.abs(roll))) : 0;
    const targetLoad=.85+.22*climb+.12*Math.abs(bank)-.73*glide;
    wingLoad+=(targetLoad-wingLoad)*blend(2.8,dt);
    phase+=dt*(1.30+wingLoad*1.71+climb*.82+heat*.22);
    const lift=active && !drag && !reduced.matches ? Math.cos(2*phase-.72)*size*.010*wingLoad : 0;
    const bodyY=y+lift, angle=pitch*yaw+roll*Math.sin(heading);
    moveBody();
    body.style.transform='translateY('+lift+'px) rotate('+angle+'rad)';
    const havePoses=turnTextures.every(image=>image.complete && image.naturalWidth);
    const side=havePoses ? smooth(.66,.91,extent) : 1;
    const front=havePoses ? 1-smooth(.15,.45,extent) : 0;
    const quarter=1-side-front;
    const noseX=.434*yaw*size;
    // Register all three snouts on the same moving point during the change of view.
    const sideWidth=(.77+.23*extent)*sign, quarterWidth=(.75+.23*extent)*sign;
    sidePose.style.opacity=side;
    sidePose.style.transform='translateX('+(noseX-.434*size*sideWidth)+'px) scaleX('+sideWidth+')';
    quarterPose.style.opacity=quarter;
    quarterPose.style.transform='translateX('+(noseX-.341*size*quarterWidth)+'px) scaleX('+quarterWidth+')';
    frontPose.style.opacity=front;
    frontPose.style.transform='translateX('+noseX+'px) scaleX('+(1-.15*extent)+')';
    rig?.(phase,bank,heat,pace,wingLoad,[
      {weight:side,shift:noseX/size-.434*sideWidth,scale:sideWidth},
      {weight:quarter,shift:noseX/size-.341*quarterWidth,scale:quarterWidth},
      {weight:front,shift:noseX/size,scale:1-.15*extent}
    ],tailLean);
    const beat=Math.sin(phase*2+.5)*.010-bank*.008;
    const mx=noseX-side*.011*heat*size*sign;
    const my=(.051+side*.86*(beat-.010*heat))*size*.5;
    const c=Math.cos(angle),s=Math.sin(angle);
    const dirX=yaw,dirY=.09+.51*Math.sin(heading), norm=Math.hypot(dirX,dirY);
    const mouth={x:x+mx*c-my*s,y:bodyY+mx*s+my*c,dx:(dirX*c-dirY*s)/norm,dy:(dirX*s+dirY*c)/norm};
    effects.draw(dt,mouth,size,active ? heat : 0);
  }
  function tick(now) {
    frame=0;
    if(lastPreference!==reduced.matches) applyMotionPreference();
    if(!active || document.hidden) return;
    const dt=previous ? Math.min((now-previous)/1000,.05) : 1/60;
    previous=now; elapsed+=dt;
    if(demo && elapsed>1.15) {burst=.72;demo=false;}
    if(helpTime>0 && (helpTime-=dt)<=0) showHelp(false);
    burst=Math.max(0,burst-dt);
    const firing=burst>0 || firePointer!==null || space;
    heat+=((firing?1:0)-heat)*blend(firing?15:8,dt);
    steer(dt);paint(dt);request();
  }
  function showHelp(show) {
    guide.hidden=!show;
    help.setAttribute("aria-expanded",String(show));
  }
  function engage() {
    demo=false; idle=0;
    if(!active) setActive(true);
  }
  function clearInputs() {
    if(drag) {
      const id=drag.id;
      drag=null; placed=true; vx=vy=0; turn=null;
      if(dragon.hasPointerCapture(id)) dragon.releasePointerCapture(id);
    }
    keys.clear();space=false;firePointer=null;burst=0;
  }
  function setActive(value) {
    active=value;clearInputs();turn=null;placed=false;idle=0;vx=vy=0;heat=0;
    dragon.hidden=!value; fire.hidden=!value; land.textContent=value?"Land dragon":"Launch dragon";
    effects.clear();previous=0;
    if(!value) { cancelAnimationFrame(frame);frame=0;showHelp(false); }
    else {resize();request();}
  }
  dragon.addEventListener("pointerdown",e=>{
    if(!e.isPrimary || e.button!==0 || drag) return;
    e.preventDefault();
    engage(); turn=null; vx=vy=0;
    const rect=dragon.getBoundingClientRect();
    // Anchor against the actual displayed position, including a pickup halfway through a glide.
    drag={id:e.pointerId,px:e.clientX,py:e.clientY,ox:e.clientX-rect.left-rect.width/2,
      oy:e.clientY-rect.top-rect.height/2,startX:e.clientX,startY:e.clientY,
      moved:false,lastMove:e.timeStamp,samples:[{x:e.clientX,y:e.clientY,t:e.timeStamp}]};
    dragon.dataset.pointerFocus="";
    // The window listeners also finish the gesture on browsers that decline capture.
    try {dragon.setPointerCapture(e.pointerId);} catch { /* The active pointer is still tracked by ID. */ }
    dragon.focus({preventScroll:true});
  });
  function samplePointer(e) {
    const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
    if(!dx && !dy) return;
    const dt=clamp((e.timeStamp-drag.lastMove)/1000,.004,.12);
    const gain=blend(32,dt);
    vx+=(clamp(dx/dt,-1400,1400)-vx)*gain;
    vy+=(clamp(dy/dt,-1400,1400)-vy)*gain;
    drag.px=e.clientX; drag.py=e.clientY; drag.lastMove=e.timeStamp;
    drag.moved ||= Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>(e.pointerType==="touch"?6:4);
    const samples=drag.samples;
    samples.push({x:e.clientX,y:e.clientY,t:e.timeStamp});
    while(samples.length>1 && (samples[0].t<e.timeStamp-110 || samples.length>64)) samples.shift();
  }
  function recordPointer(e) {
    if(!drag || drag.id!==e.pointerId) return;
    for(const sample of e.getCoalescedEvents?.() ?? []) samplePointer(sample);
    samplePointer(e);
    if(drag.moved) positionInHand();
  }
  function dropVelocity(e) {
    const samples=drag.samples,first=samples[0],last=samples[samples.length-1];
    const dt=(e.timeStamp-first.t)/1000;
    if(!drag.moved || e.timeStamp-drag.lastMove>64 || dt<=0 || dt>.16) return null;
    const dx=last.x-first.x,dy=last.y-first.y,distance=Math.hypot(dx,dy);
    const speed=distance/dt;
    if(distance<Math.min(38,width*.08) || speed<clamp(width*.62,440,720)) return null;
    let path=0;
    for(let i=1;i<samples.length;i++) path+=Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y);
    if(distance<path*.83) return null;
    const gain=Math.min(speed*.72,900)/distance;
    return {x:dx*gain,y:dy*gain};
  }
  function release(e) {
    if(!drag || drag.id!==e.pointerId) return;
    // Capture loss can report (0,0). Only a real pointerup supplies a final placement.
    if(e.type==="pointerup") recordPointer(e);
    const moved=drag.moved, flick=e.type==="pointerup" ? dropVelocity(e) : null;
    const id=drag.id;
    drag=null; idle=0;
    if(dragon.hasPointerCapture(id)) dragon.releasePointerCapture(id);
    vx=flick?.x ?? 0; vy=flick?.y ?? 0;
    if(moved || e.type!=="pointerup") placed=!flick;
    if(flick && Math.hypot(vx,vy)>360) burst=.43;
    if(!moved && e.type==="pointerup") burst=.70;
    request();
  }
  // The physical pointer stays captured even when the visible wings turn away from it.
  const pointerEvents={capture:true,signal:lifecycle.signal};
  window.addEventListener("pointermove",recordPointer,pointerEvents);
  dragon.addEventListener("dragstart",e=>e.preventDefault());
  dragon.addEventListener("contextmenu",e=>e.preventDefault());
  dragon.addEventListener("blur",()=>delete dragon.dataset.pointerFocus);
  window.addEventListener("pointerup",release,pointerEvents);
  window.addEventListener("pointercancel",release,pointerEvents);
  dragon.addEventListener("lostpointercapture",release);
  dragon.addEventListener("click",e=>{ if(e.detail===0) {engage();burst=.7;} });
  fire.addEventListener("pointerdown",e=>{
    if(e.button!==0 || firePointer!==null) return;
    engage(); firePointer=e.pointerId;burst=.52;fire.setPointerCapture(e.pointerId);
  });
  for(const type of ["pointerup","pointercancel","lostpointercapture"]) fire.addEventListener(type,e=>{if(e.pointerId===firePointer) firePointer=null;});
  fire.addEventListener("click",e=>{if(e.detail===0) {engage();burst=.72;}});
  land.addEventListener("click",()=>{demo=false;setActive(!active);if(active) dragon.focus({preventScroll:true});});
  help.addEventListener("click",()=>{helpTime=0;showHelp(guide.hidden);});
  document.addEventListener("keydown",e=>{
    const origin=e.composedPath()[0];
    if(!active || e.ctrlKey || e.metaKey || e.altKey || origin!==dragon) return;
    if(e.code in directions) {e.preventDefault();engage();placed=false;delete dragon.dataset.pointerFocus;if(!keys.has(e.code)) turn=null;keys.add(e.code);}
    if(e.code==="Space") {e.preventDefault();engage();space=true;if(!e.repeat) burst=.48;}
  },events);
  document.addEventListener("keyup",e=>{keys.delete(e.code);if(e.code==="Space") space=false;},events);
  window.addEventListener("blur",clearInputs,events);
  document.addEventListener("visibilitychange",()=>{previous=0;if(document.hidden) clearInputs();else request();},events);
  function applyMotionPreference() {
    if(lastPreference===reduced.matches) return;
    lastPreference=reduced.matches; demo=false; setActive(!lastPreference);
  }
  reduced.addEventListener("change",applyMotionPreference,events);
  rigCanvas.addEventListener("webglcontextlost",e=>{e.preventDefault();rig=null;if(!lifecycle.signal.aborted) showFallback();});
  function showFallback() {
    dragon.classList.remove("rigged");
    // The same skinned poses are available as compact loops on software-only devices.
    const files=["gliding.webp","glide-quarter.webp","glide-front.webp"];
    [sidePose,quarterPose,frontPose].forEach((layer,i)=>{
      if(layer.querySelector(".sprite")) return;
      const image=new Image();
      image.className="sprite"; image.alt=""; image.draggable=false;
      image.src=assetURL(files[i]); layer.append(image);
      image.decode().then(()=>layer.classList.add("has-sprite")).catch(()=>{});
    });
  }
  function mountRig() {
    if(lifecycle.signal.aborted) return;
    try {rig=createWingRig(rigCanvas,texture,turnTextures);} catch {rig=null;}
    if(rig) dragon.classList.add("rigged"); else showFallback();
    paint(0);request();
  }
  rigCanvas.addEventListener("webglcontextrestored",mountRig);
  flight.hidden=false;
  resize();setActive(active);
  window.addEventListener("resize",resize,events);
  Promise.all([texture,...turnTextures].map(image=>image.decode()))
    .then(mountRig).catch(()=>{if(!lifecycle.signal.aborted) showFallback();});

  return () => {
    lifecycle.abort();
    active=false; clearInputs(); cancelAnimationFrame(frame); effects.clear();
    // Release GPU resources when the host navigates away and removes the overlay.
    if(rig) rigCanvas.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
