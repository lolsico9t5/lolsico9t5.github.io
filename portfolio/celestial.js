import { loadSurfaces } from "./planet-surfaces.js";

const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const limit = value => Math.max(0, Math.min(1, value));

async function gatherPortrait() {
  const image = document.querySelector(".portrait");
  const canvas = document.querySelector(".gathering");
  const context = canvas.getContext("2d");
  if (!context || motionPreference.matches) return;

  image.style.opacity = "0";
  try {
    await image.decode();
    const columns = 55;
    const rows = Math.round(columns * image.naturalHeight / image.naturalWidth);
    const sample = document.createElement("canvas");
    sample.width = columns; sample.height = rows;
    const brush = sample.getContext("2d");
    brush.drawImage(image, 0, 0, columns, rows);
    const pixels = brush.getImageData(0, 0, columns, rows).data;
    const stars = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const u = (col + .5) / columns, v = (row + .5) / rows;
        const i = (row * columns + col) * 4;
        stars.push({
          u, v, angle: Math.random() * Math.PI * 2,
          radius: .32 + Math.random() * .58,
          delay: (u*.28 + v*.72)*1050 + Math.random()*950,
          bend: .35 + Math.random()*.8,
          color: 'rgb(' + pixels[i] + ',' + pixels[i+1] + ',' + pixels[i+2] + ')',
          glint: Math.random() > .92
        });
      }
    }

    let width, height, left, top, photoWidth, photoHeight;
    function measure() {
      const area = canvas.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      width = area.width; height = area.height;
      photoWidth = photo.width; photoHeight = photo.height;
      left = photo.left - area.left; top = photo.top - area.top;
      const ratio = Math.min(devicePixelRatio, 1.6);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    measure();
    const sizeObserver = new ResizeObserver(measure);
    sizeObserver.observe(canvas);
    const start = performance.now();
    function draw(now) {
      const elapsed = now - start;
      const reveal = limit((elapsed - 2500) / 2400);
      if (reveal === 1 || motionPreference.matches) {
        sizeObserver.disconnect();
        canvas.hidden = true;
        image.style.opacity = "1";
        image.style.maskImage = "";
        return;
      }
      image.style.opacity = reveal > 0 ? "1" : "0";
      const edge = reveal * 150 - 25;
      image.style.maskImage = 'linear-gradient(152deg, black '+(edge-15)+'%, transparent '+(edge+15)+'%)';
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const travel = limit((elapsed - star.delay) / 2500);
        const ease = travel * travel * (3 - 2 * travel);
        const remaining = 1 - ease;
        const direction = star.angle + star.bend * ease;
        const x = left + star.u * photoWidth + Math.cos(direction) * width * star.radius * remaining;
        const y = top + star.v * photoHeight + Math.sin(direction) * height * star.radius * remaining;
        const radius = .55 + ease * photoWidth / columns * .33;
        const localFade = limit((star.u*.28 + star.v*.72 - edge/100 + .16) / .28);
        context.globalAlpha = localFade * (.26 + ease * .74) * limit((elapsed + 200 - star.delay) / 500);
        context.fillStyle = ease > .76 ? star.color : star.glint ? "#ffdca7" : "#d7ddff";
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        if (star.glint && travel > .04 && travel < .91) {
          const trail = 15 * Math.sin(travel * Math.PI);
          context.beginPath();
          context.moveTo(x,y);
          context.lineTo(x+Math.cos(direction)*trail,y+Math.sin(direction)*trail);
          context.strokeStyle = "#c7ceff";
          context.lineWidth = .7;
          context.stroke();
          context.fillRect(x - 3, y, 6, .7);
          context.fillRect(x, y - 3, .7, 6);
        }
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  } catch {
    image.style.opacity = "1";
    image.style.maskImage = "";
    canvas.hidden = true;
  }
}

function orbitNavigation() {
  const map = document.querySelector(".orbit-map");
  const worlds = Array.from(map.querySelectorAll(".world"));
  // Earth, Mars, Jupiter, Saturn, Mercury, Uranus, Venus, Neptune, and Ceres.
  // Compress orbital distances for legible navigation, keeping their order.
  const scales = [.55,.64,.78,.85,.34,.92,.45,1,.71];
  const eccentricities = [.017,.093,.049,.057,.13,.046,.007,.009,.08];
  const tracks = scales.map(scale => {
    const ring = document.createElement("span");
    ring.className = "track";
    ring.setAttribute("aria-hidden", "true");
    map.prepend(ring);
    return {ring, scale};
  });
  const diameters = [52,43,74,61,31,48,49,48,27];
  const starts = [-2.55,-1.67,-.94,-.37,.13,.76,1.49,2.07,2.96];
  let orbitTime = 0, spinTime = 0, frame = 0, previous = 0, visible = false;
  let surfaces, lastPaint = -1, pointing = false, pressing = false;
  let width, height, radiusX, radiusY, sizes;
  // On a narrow ellipse the top and bottom arcs bunch together. Keep every
  // moving label and its touch target clear of its neighbours.
  function separateTargets(points) {
    const gap = 5;
    for (let pass = 0; pass < 10; pass++) {
      let crowded = false;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i], b = points[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const overlapX = (sizes[i].w + sizes[j].w) / 2 + gap - Math.abs(dx);
          const overlapY = (sizes[i].h + sizes[j].h) / 2 + gap - Math.abs(dy);
          if (overlapX <= .1 || overlapY <= .1) continue;
          crowded = true;
          if (overlapX < overlapY) {
            const shift = (Math.sign(dx) || 1) * overlapX / 2;
            a.x = Math.max(sizes[i].w / 2, Math.min(width - sizes[i].w / 2, a.x - shift));
            b.x = Math.max(sizes[j].w / 2, Math.min(width - sizes[j].w / 2, b.x + shift));
          } else {
            const shift = (Math.sign(dy) || 1) * overlapY / 2;
            a.y -= shift; b.y += shift;
          }
        }
      }
      if (!crowded) break;
    }
  }
  function place(redraw = false) {
    const bodies = worlds.map((world, i) => {
      const scale = scales[i], e = eccentricities[i];
      const mean = starts[i] + orbitTime * .025 / scale**1.5;
      // Two Newton steps solve Kepler's equation at these eccentricities.
      let anomaly = mean;
      for(let step=0;step<2;step++) anomaly-=(anomaly-e*Math.sin(anomaly)-mean)/(1-e*Math.cos(anomaly));
      const dx = Math.cos(anomaly)-e, dy = Math.sqrt(1-e*e)*Math.sin(anomaly);
      return {x:width/2+radiusX*scale*dx, y:height/2+radiusY*scale*dy, angle:Math.atan2(dy,dx)};
    });
    const positions = bodies.map((body,i)=>({x:body.x,y:body.y+sizes[i].offset}));
    separateTargets(positions);
    worlds.forEach((world, i) => {
      const {x, y} = positions[i];
      world.style.setProperty("--x", x.toFixed(2) + "px");
      world.style.setProperty("--y", y.toFixed(2) + "px");
      world.style.setProperty("--body-x", (bodies[i].x-x).toFixed(2) + "px");
      world.style.setProperty("--body-y", (bodies[i].y+sizes[i].offset-y).toFixed(2) + "px");
    });
    if (surfaces && (redraw || spinTime - lastPaint >= 1/18)) {
      surfaces.forEach((draw,i)=>draw(spinTime,bodies[i]?.angle || 0));
      lastPaint = spinTime;
    }
  }
  function measure() {
    width = map.clientWidth; height = map.clientHeight;
    sizes = worlds.map(world => ({
      w: world.offsetWidth, h: world.offsetHeight,
      offset: (world.offsetHeight - world.querySelector(".globe").offsetHeight) / 2 - 4
    }));
    radiusX = Math.max(1, width / 2 - (width < 440 ? 49 : 65));
    radiusY = Math.max(1, height / 2 - 46);
    tracks.forEach(({ring, scale},i) => {
      const e = eccentricities[i];
      ring.style.left = (width/2-radiusX*scale*e) + "px";
      ring.style.width = 2 * radiusX * scale + "px";
      ring.style.height = 2 * radiusY * scale * Math.sqrt(1-e*e) + "px";
    });
    place(true);
  }
  function tick(time) {
    const delta = previous ? Math.min((time - previous) / 1000, .1) : 0;
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
