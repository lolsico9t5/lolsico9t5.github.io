import { loadSurfaces } from "./planet-surfaces.js?v=3";

const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const limit = value => Math.max(0, Math.min(1, value));

// Sample the real glyphs at their final layout positions so the dust settles
// into the same lettering that remains selectable after the reveal.
function sampleLetters(line, bounds, lineIndex, addStar) {
  const rect = line.getBoundingClientRect();
  const style = getComputedStyle(line);
  const tile = document.createElement("canvas");
  tile.width = Math.ceil(rect.width);
  tile.height = Math.ceil(rect.height + 12);
  const pen = tile.getContext("2d");
  pen.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
  pen.letterSpacing = style.letterSpacing;
  const metrics = pen.measureText(line.textContent);
  const baseline = (rect.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent)/2 + metrics.fontBoundingBoxAscent;
  const inset = style.textAlign === "center" ? (rect.width-metrics.width)/2 : 0;
  pen.fillText(line.textContent,inset,baseline+6);
  const ink=pen.getImageData(0,0,tile.width,tile.height).data;
  for(let y=1;y<tile.height;y+=3) for(let x=1;x<tile.width;x+=3) {
    if(ink[(y*tile.width+x)*4+3]<100) continue;
    addStar(rect.left-bounds.left+x,rect.top-bounds.top+y-6,
      lineIndex ? [212,203,252] : [255,244,227], .18+lineIndex*.16+.36*x/tile.width, lineIndex+1);
  }
}

async function gatherPortrait() {
  const image = document.querySelector(".portrait");
  const lines = Array.from(document.querySelectorAll(".identity h1 > *"));
  const canvas = document.querySelector(".gathering");
  const ctx = canvas.getContext("2d");
  const root = document.documentElement;
  if (!ctx || motionPreference.matches || !root.classList.contains("awaiting-portrait")) {
    root.classList.remove("awaiting-portrait");
    canvas.hidden = true;
    return;
  }
  const layers = [image,...lines];
  let observer;
  function finish() {
    observer?.disconnect();
    canvas.hidden = true;
    layers.forEach(el=>{ el.style.opacity="1"; el.style.maskImage=""; });
  }
  layers.forEach(el=>el.style.opacity="0");
  root.classList.remove("awaiting-portrait");
  const loadTimeout = setTimeout(finish, 3500);
  try {
    await image.decode();
    clearTimeout(loadTimeout);
    if (canvas.hidden) return;
    const cols=65, rows=Math.round(cols*image.naturalHeight/image.naturalWidth);
    const sample=document.createElement("canvas");
    sample.width=cols; sample.height=rows;
    const pen=sample.getContext("2d");
    pen.drawImage(image,0,0,cols,rows);
    const pixels=pen.getImageData(0,0,cols,rows).data;
    const stars=[];
    let width,height;
    function addStar(x,y,rgb,order,group) {
      const seed=Math.random(), fromLeft=Math.random()<.5;
      const pathAngle=(fromLeft ? Math.PI : 0) + (seed-.5)*2.1;
      const length=width*(.16+Math.random()*.69);
      const light=group ? [252,229,190] : seed>.72 ? [243,220,174] : [190,204,250];
      const palette=Array.from({length:9},(_,k)=>
        "rgb("+rgb.map((v,c)=>Math.round(light[c]+(v-light[c])*k/8)).join(",")+")");
      stars.push({x,y,order,group,palette,angle:pathAngle,length,seed,
        delay:order*1100+Math.random()*680, duration:1500+seed*800, glint:seed>.964});
    }
    function measure() {
      const area=canvas.getBoundingClientRect(), photo=image.getBoundingClientRect();
      width=area.width; height=area.height;
      const dpr=Math.min(1.6,devicePixelRatio);
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      stars.length=0;
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const u=(col+.5)/cols,v=(row+.5)/rows,i=4*(row*cols+col);
        const distance=Math.hypot((u-.52)*.88,v-.29);
        addStar(photo.left-area.left+u*photo.width,photo.top-area.top+v*photo.height,
          [pixels[i],pixels[i+1],pixels[i+2]],distance,0);
      }
      lines.forEach((line,i)=>sampleLetters(line,area,i,addStar));
    }
    measure();
    observer=new ResizeObserver(measure);
    observer.observe(canvas);
    const start=performance.now();
    function draw(now) {
      const t=now-start;
      if(t>=4900 || motionPreference.matches) {finish();return;}
      const focus=limit((t-2150)/2650);
      image.style.opacity=focus>0?"1":"0";
      const edge=focus*150-20;
      image.style.maskImage="radial-gradient(ellipse farthest-corner at 52% 29%, black "+(edge-12)+"%, transparent "+(edge+15)+"%)";
      lines.forEach((line,i)=>{
        const edge=limit((t-1860-i*410)/1650)*145-20;
        line.style.opacity="1";
        line.style.maskImage="linear-gradient(102deg, black "+(edge-10)+"%, transparent "+(edge+14)+"%)";
      });
      ctx.clearRect(0,0,width,height);
      for(const s of stars) {
        const u=limit((t-s.delay)/s.duration);
        if(!u) continue;
        const rest=(1-u)**3;
        const a=s.angle + (1-rest)*(.55+s.seed*.9);
        const x=s.x+Math.cos(a)*s.length*rest, y=s.y+Math.sin(a)*s.length*rest*.64;
        const fade=s.group ? limit((4200-t)/900) : limit((s.order-focus*1.3+.32)/.35);
        ctx.globalAlpha=fade*Math.min(1,u*7)*(.38+.62*u);
        if(ctx.globalAlpha<=.01) continue;
        const color=s.palette[Math.round(8*u*u)];
        ctx.fillStyle=color;
        const r=(s.glint ? 1.85 : .65+s.seed*.65)*(1-.16*u);
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        if(s.glint && u<.95) {
          const tail=1+21*rest;
          ctx.strokeStyle=color; ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*tail,y+Math.sin(a)*tail*.64);ctx.stroke();
          ctx.globalAlpha*=.5;
          ctx.fillRect(x-3,y-.35,6,.7);ctx.fillRect(x-.35,y-3,.7,6);
        }
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  } catch {clearTimeout(loadTimeout); finish();}
}

function orbitNavigation() {
  const map = document.querySelector(".orbit-map");
  const worlds = Array.from(map.querySelectorAll(".world"));
  // Earth, Mars, Jupiter, Saturn, Mercury, Uranus, Venus, Neptune, and Ceres.
  // Compress orbital distances for legible navigation, keeping their order.
  const orbitalRadii = [.62,.68,.80,.86,.43,.93,.53,1,.74];
  const eccentricities = [.017,.093,.049,.057,.13,.046,.007,.009,.08];
  const tracks = orbitalRadii.map(() => {
    const ring = document.createElement("span");
    ring.className = "track";
    ring.setAttribute("aria-hidden", "true");
    map.prepend(ring);
    return ring;
  });
  const diameters = [72,54,91,66,35,58,61,59,32];
  const starts = [-2.64,-1.93,-1.22,-.51,.20,.88,1.57,2.27,2.96];
  let orbitTime = 0, spinTime = 0, frame = 0, previous = 0, visible = false;
  let surfaces, lastPaint = -1, pointing = false, pressing = false;
  let width, height, radiusX, radiusY, sizes, sunSize;
  let lastOrbitTime, previousTargets;
  let scales, arcLengths;
  const arcSteps = 256, tau = 2*Math.PI;
  // Equal angular gaps on a narrow ellipse bunch up at its tips. Parameterize
  // the projected path by distance so that planets approach those turns evenly.
  function angleAtDistance(phase) {
    const fraction = ((phase/tau)%1+1)%1;
    const target = fraction*arcLengths[arcSteps];
    let lo=0, hi=arcSteps;
    while(hi-lo>1) {
      const mid=(lo+hi)>>1;
      if(arcLengths[mid]<=target) lo=mid;
      else hi=mid;
    }
    return (lo+(target-arcLengths[lo])/(arcLengths[hi]-arcLengths[lo]))*tau/arcSteps;
  }
  // Resolve entire planet/link footprints together, including Saturn's rings
  // and the fixed sun. A narrow viewport trades orbital scale for readability.
  function separateTargets(points) {
    const gap = width < 500 ? 5 : 9;
    const fixed = {x:width/2, y:height/2, w:sunSize, h:sunSize};
    const units = points.map((point,i)=>Object.assign(point,sizes[i]));
    units.push(fixed);
    function bound(unit) {
      unit.x = Math.max(unit.w/2, Math.min(width-unit.w/2,unit.x));
      unit.y = Math.max(unit.h/2, Math.min(height-unit.h/2,unit.y));
    }
    points.forEach(bound);
    for (let pass=0; pass<40; pass++) {
      let clear=true;
      for (let i=0; i<points.length; i++) {
        const a=units[i];
        for (let j=i+1; j<units.length; j++) {
          const b=units[j], dx=b.x-a.x, dy=b.y-a.y;
          const ox=(a.w+b.w)/2 + gap - Math.abs(dx);
          const oy=(a.h+b.h)/2 + gap - Math.abs(dy);
          if (ox < .1 || oy < .1) continue;
          clear=false;
          const axis=ox<oy ? "x" : "y";
          const distance=(axis==="x" ? ox*(Math.sign(dx)||1) : oy*(Math.sign(dy)||1));
          const share=b===fixed ? 1 : .5;
          a[axis]-=distance*share;
          bound(a);
          if (b!==fixed) { b[axis]+=distance*(1-share); bound(b); }
        }
      }
      if(clear) break;
    }
  }
  function place(redraw = false) {
    const bodies = worlds.map((world, i) => {
      const scale = scales[i], e = eccentricities[i];
      // Keep adjacent navigation links spaced around the sun throughout the cycle.
      const phase = starts[i] + orbitTime * .036;
      const mean = angleAtDistance(phase + .055 * Math.sin(phase + starts[i]));
      // Two Newton steps solve Kepler's equation at these eccentricities.
      let anomaly = mean;
      for(let step=0;step<2;step++) anomaly-=(anomaly-e*Math.sin(anomaly)-mean)/(1-e*Math.cos(anomaly));
      const dx = Math.cos(anomaly)-e, dy = Math.sqrt(1-e*e)*Math.sin(anomaly);
      return {x:width/2+radiusX*scale*dx, y:height/2+radiusY*scale*dy, angle:Math.atan2(dy,dx)};
    });
    // Start from the last collision-free placement. As two paths approach,
    // this lets links slide around the same side instead of switching sides
    // abruptly when the shorter separation axis changes.
    const delta = previousTargets ? Math.min(.25,Math.max(0,orbitTime-lastOrbitTime)) : 0;
    const follow = previousTargets ? 1-Math.exp(-delta*5) : 1;
    const positions = bodies.map((body,i)=>{
      const x=body.x, y=body.y+sizes[i].offset, old=previousTargets?.[i];
      if (!old) return {x,y};
      const dx=x-old.x, dy=y-old.y;
      const step=Math.min(follow, 52*delta/Math.max(.01,Math.hypot(dx,dy)));
      return {x:old.x+dx*step, y:old.y+dy*step};
    });
    separateTargets(positions);
    previousTargets = positions;
    lastOrbitTime = orbitTime;
    worlds.forEach((world, i) => {
      const {x, y} = positions[i];
      world.style.setProperty("--x", x.toFixed(2) + "px");
      world.style.setProperty("--y", y.toFixed(2) + "px");
    });
    if (surfaces && (redraw || spinTime - lastPaint >= 1/24)) {
      surfaces.forEach((draw,i)=>draw(spinTime,bodies[i]?.angle || 0));
      lastPaint = spinTime;
    }
  }
  function measure() {
    width = map.clientWidth; height = map.clientHeight;
    previousTargets = null;
    sunSize = map.querySelector(".sun").offsetWidth;
    sizes = worlds.map((world,i) => {
      const globe = world.querySelector(".globe");
      return { w:Math.max(world.offsetWidth, i===3 ? globe.offsetWidth*2.1 : 0),
        h:world.offsetHeight, offset:world.offsetHeight/2-globe.offsetTop-globe.offsetHeight/2 };
    });
    radiusX = Math.max(1, width / 2 - (width < 440 ? 49 : 65));
    radiusY = Math.max(1, height / 2 - 54);
    const compression = width < 620 ? .64 : .18;
    scales = orbitalRadii.map(radius=>compression+(1-compression)*radius);
    arcLengths = [0];
    for(let i=1;i<=arcSteps;i++) {
      const a=(i-1)*tau/arcSteps, b=i*tau/arcSteps;
      arcLengths.push(arcLengths[i-1]+Math.hypot(radiusX*(Math.cos(b)-Math.cos(a)),radiusY*(Math.sin(b)-Math.sin(a))));
    }
    tracks.forEach((ring,i) => {
      const scale = scales[i];
      const e = eccentricities[i];
      ring.style.left = (width/2-radiusX*scale*e) + "px";
      ring.style.width = 2 * radiusX * scale + "px";
      ring.style.height = 2 * radiusY * scale * Math.sqrt(1-e*e) + "px";
    });
    place(true);
  }
  function tick(time) {
    const delta = previous ? (time - previous) / 1000 : 0;
    previous = time;
    spinTime += delta;
    if (!pointing && !pressing && !map.matches(":focus-within")) orbitTime += delta;
    place();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = 0;
    if (visible && !motionPreference.matches && !document.hidden) {
      frame = requestAnimationFrame(tick);
    }
  }
  worlds.forEach((world, i) => world.style.setProperty("--diameter", diameters[i] + "px"));
  map.classList.add("ready");
  measure();
  let loadingSurfaces = false;
  function showSurfaces() {
    if (loadingSurfaces) return;
    loadingSurfaces = true;
    const hosts = worlds.map(world=>world.querySelector(".globe"));
    loadSurfaces([...hosts,map.querySelector(".sun")]).then(draw => {
      surfaces = draw;
      place(true);
    }).catch(() => { loadingSurfaces = false; });
  }
  map.addEventListener("pointerover", event => { pointing = event.pointerType !== "touch" && !!event.target.closest(".world"); });
  map.addEventListener("pointerleave", () => { pointing = false; });
  map.addEventListener("pointerdown", () => { pressing = true; });
  for(const type of ["pointerup","pointercancel","blur"]) window.addEventListener(type,()=>{pressing=false;});
  motionPreference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  new ResizeObserver(measure).observe(map);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { map.classList.add("charted"); showSurfaces(); }
    sync();
  }).observe(map);
  sync();
}

gatherPortrait();
orbitNavigation();
