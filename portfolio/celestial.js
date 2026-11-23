const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const limit = value => Math.max(0, Math.min(1, value));
const ease = value => value*value*(3-2*value);

// Sample the real glyphs at their final layout positions so the dust settles
// into the same lettering that remains selectable after the reveal.
function sampleLetters(line, bounds, lineIndex, addStar) {
  const text = line.firstChild;
  const style = getComputedStyle(line);
  const marker = document.createElement("i");
  marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  line.append(marker);
  const baseline = marker.getBoundingClientRect().top;
  marker.remove();
  const rect = line.getBoundingClientRect();
  const tile = document.createElement("canvas");
  tile.width = Math.ceil(rect.width);
  tile.height = Math.ceil(rect.height);
  const pen = tile.getContext("2d");
  pen.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
  // Use each rendered character's actual position, including the browser's
  // kerning and tracking. Both the sampling tile and the mask include the ink
  // below the baseline and the overhang at the ends of the line.
  const range = document.createRange();
  let offset = 0;
  for (const glyph of text.data) {
    range.setStart(text,offset);
    offset += glyph.length;
    range.setEnd(text,offset);
    const left = range.getBoundingClientRect().left - rect.left;
    pen.fillText(glyph,left,baseline-rect.top);
  }
  const ink = pen.getImageData(0,0,tile.width,tile.height).data;
  const step = parseFloat(style.fontSize) < 70 ? 2 : 3;
  const color = lineIndex ? [212,203,252] : [255,244,227];
  for(let y=1;y<tile.height;y+=step) for(let x=1;x<tile.width;x+=step) {
    if(ink[(y*tile.width+x)*4+3]<80) continue;
    addStar(rect.left-bounds.left+x,rect.top-bounds.top+y,
      color,.18+lineIndex*.16+.36*x/tile.width,lineIndex+1);
  }
}

function gatherPortrait() {
  const image = document.querySelector(".portrait");
  const lines = Array.from(document.querySelectorAll(".identity .name-ink"));
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
  try {
    const stars=[];
    let width,height,cols,rows,pixels;
    const palettes=new Map();
    function addStar(x,y,rgb,order,group) {
      const seed=Math.random(), fromLeft=Math.random()<.5;
      const pathAngle=(fromLeft ? Math.PI : 0) + (seed-.5)*2.1;
      const length=width*(.16+Math.random()*.69);
      const light=group ? [252,229,190] : seed>.72 ? [243,220,174] : [190,204,250];
      const key=(light[0]<<16)|((rgb[0]>>4)<<8)|((rgb[1]>>4)<<4)|(rgb[2]>>4);
      let palette=palettes.get(key);
      if(!palette) {
        palette=Array.from({length:5},(_,k)=>
          "rgb("+rgb.map((v,c)=>Math.round(light[c]+(v-light[c])*k/4)).join(",")+")");
        palettes.set(key,palette);
      }
      stars.push({x,y,order,group,palette,angle:pathAngle,length,seed,
        delay:order*1100+Math.random()*680, duration:1500+seed*800, glint:seed>.964});
    }
    function addPortraitStars() {
      const area=canvas.getBoundingClientRect(), photo=image.getBoundingClientRect();
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const u=(col+.5)/cols,v=(row+.5)/rows,i=4*(row*cols+col);
        const distance=Math.hypot((u-.52)*.88,v-.29);
        addStar(photo.left-area.left+u*photo.width,photo.top-area.top+v*photo.height,
          [pixels[i],pixels[i+1],pixels[i+2]],distance,0);
      }
    }
    function measure() {
      const area=canvas.getBoundingClientRect();
      width=area.width; height=area.height;
      const dpr=Math.min(1.5,devicePixelRatio);
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      stars.length=0;
      if(pixels) addPortraitStars();
      lines.forEach((line,i)=>sampleLetters(line,area,i,addStar));
    }
    measure();
    image.decode().then(()=>{
      if(canvas.hidden) return;
      cols=Math.max(30,Math.min(54,Math.round(image.clientWidth/7)));
      rows=Math.round(cols*image.naturalHeight/image.naturalWidth);
      const sample=document.createElement("canvas");
      sample.width=cols; sample.height=rows;
      const pen=sample.getContext("2d");
      pen.drawImage(image,0,0,cols,rows);
      pixels=pen.getImageData(0,0,cols,rows).data;
      addPortraitStars();
    }).catch(()=>{});
    observer=new ResizeObserver(([entry])=>{
      const box=entry.contentRect;
      if(Math.abs(box.width-width)>.5 || Math.abs(box.height-height)>.5) measure();
    });
    observer.observe(canvas);
    const start=performance.now();
    function draw(now) {
      const t=(now-start)*1.68;
      if(t>=4900 || motionPreference.matches) {finish();return;}
      const focus=ease(limit((t-1250)/3050));
      image.style.opacity=focus>0?"1":"0";
      const edge=focus*150-20;
      image.style.maskImage="radial-gradient(ellipse farthest-corner at 52% 29%, black "+(edge-12)+"%, transparent "+(edge+15)+"%)";
      lines.forEach((line,i)=>{
        const edge=ease(limit((t-1710-i*380)/2070))*145-20;
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
        const fade=s.group ? ease(limit((4390-t)/1050)) : ease(limit((s.order-focus*1.3+.32)/.35));
        ctx.globalAlpha=fade*ease(Math.min(1,u*5))*(.38+.62*u);
        if(ctx.globalAlpha<=.01) continue;
        const color=s.palette[Math.round(4*u*u)];
        ctx.fillStyle=color;
        const r=(s.glint ? 1.85 : .65+s.seed*.65)*(1-.16*u);
        ctx.fillRect(x-r,y-r,2*r,2*r);
        if(s.glint) {
          // Trace back along the same curved flight path. The streak shortens
          // naturally as a star settles into a letter or into the portrait.
          const past=(1-Math.max(0,u-.018))**3;
          const pastAngle=s.angle+(1-past)*(.55+s.seed*.9);
          ctx.globalAlpha*=.6;
          ctx.strokeStyle=color; ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(x,y);
          ctx.lineTo(s.x+Math.cos(pastAngle)*s.length*past,s.y+Math.sin(pastAngle)*s.length*past*.64);
          ctx.stroke();
          const flare=1.2+2.8*Math.sin(Math.PI*u)**2;
          ctx.fillRect(x-flare,y-.35,2*flare,.7);ctx.fillRect(x-.35,y-flare,.7,2*flare);
        }
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  } catch {finish();}
}

function orbitNavigation() {
  const map = document.querySelector(".orbit-map");
  const viewport = map.parentElement;
  const panControl = document.querySelector(".orbit-pan");
  const panSlider = panControl.querySelector("input");
  let panDistance = 0;
  panSlider.addEventListener("input", () => {
    viewport.scrollLeft = panDistance * panSlider.valueAsNumber / 100;
  });
  viewport.addEventListener("scroll", () => {
    if (panDistance > 0) panSlider.value = Math.round(100 * viewport.scrollLeft / panDistance);
  }, {passive:true});
  const worlds = Array.from(map.querySelectorAll(".world"));
  // Earth, Mars, Jupiter, Saturn, Mercury, Uranus, Venus, Neptune, and Ceres.
  // Compress orbital distances for legible navigation, keeping their order.
  const orbitalRadii = [.62,.68,.80,.86,.43,.93,.53,1,.74];
  const tracks = worlds.map(world => {
    const ring = document.createElement("span");
    ring.className = "track";
    ring.dataset.section = world.hash.slice(1);
    ring.setAttribute("aria-hidden", "true");
    map.prepend(ring);
    return ring;
  });
  const diameters = [72,54,91,66,35,58,61,59,32];
  let orbitTime = 0, spinTime = 0, frame = 0, previous = 0, visible = false;
  let surfaces, lastPaint = -1, pointing = false, pressing = false;
  let width, height, orbits;
  const tau = 2*Math.PI;
  function place(redraw = false) {
    const phase = orbitTime * .036;
    worlds.forEach((world,i) => {
      const path = orbits[i];
      const angle = phase + path.start;
      const x = width/2 + path.rx*Math.cos(angle);
      const y = height/2 + path.ry*Math.sin(angle);
      world.style.setProperty("--x", x.toFixed(3)+"px");
      world.style.setProperty("--y", (y-path.anchorY).toFixed(3)+"px");
    });
    if (surfaces && (redraw || spinTime-lastPaint >= 1/24)) {
      worlds.forEach((_,i)=>surfaces[i](spinTime,phase+orbits[i].start));
      surfaces[worlds.length](spinTime,0);
      lastPaint = spinTime;
    }
  }
  function measure() {
    width = map.clientWidth;
    height = map.clientHeight;
    orbits = worlds.map((world,i) => {
      const globe = world.querySelector(".globe");
      const anchorY = globe.offsetTop + globe.offsetHeight/2;
      const scale = .40 + .60*orbitalRadii[i];
      return {scale, anchorY,
        halfWidth:Math.max(world.offsetWidth/2,i===3 ? globe.offsetWidth*1.06 : 0),
        above:anchorY, below:world.offsetHeight-anchorY, start:0};
    });
    const rx = Math.min(...orbits.map(p=>(width/2-p.halfWidth-6)/p.scale));
    const ry = Math.min(...orbits.map(p=>(height/2-Math.max(p.above,p.below)-6)/p.scale));
    // On concentric, similarly projected ellipses the normalized distance
    // between two bodies stays constant for an entire revolution. Reserve
    // enough angle for the two link footprints, including the rings.
    const gaps = orbits.map((a,i) => {
      const b = orbits[(i+1)%orbits.length];
      const clearance = Math.hypot((a.halfWidth+b.halfWidth+6)/rx,
        (Math.max(a.above+b.below,b.above+a.below)+6)/ry);
      const cosine = (a.scale**2+b.scale**2-clearance**2)/(2*a.scale*b.scale);
      return Math.acos(Math.min(1,Math.max(-1,cosine)));
    });
    const total = gaps.reduce((sum,gap)=>sum+gap,0);
    // Put the About link inside the centered phone panorama on first visit.
    let start = width > viewport.clientWidth ? -2.22 : -2.64;
    orbits.forEach((path,i) => {
      path.start = start;
      path.rx = rx*path.scale;
      path.ry = ry*path.scale;
      start += gaps[i] + (tau-total)/orbits.length;
      tracks[i].style.width = 2*path.rx+"px";
      tracks[i].style.height = 2*path.ry+"px";
    });
    place(true);
    const overflow = Math.max(0, width - viewport.clientWidth);
    if (overflow !== panDistance) {
      const fraction = panDistance ? panSlider.valueAsNumber / 100 : .5;
      panDistance = overflow;
      panControl.hidden = overflow === 0;
      viewport.scrollLeft = overflow * fraction;
      panSlider.value = Math.round(fraction * 100);
    }
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
    import("./planet-surfaces.js?v=4").then(({loadSurfaces})=>
      loadSurfaces([...hosts,map.querySelector(".sun")])).then(draw => {
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
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(map);
  resizeObserver.observe(viewport);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { map.classList.add("charted"); showSurfaces(); }
    sync();
  }).observe(map);
  sync();
}

gatherPortrait();
orbitNavigation();
