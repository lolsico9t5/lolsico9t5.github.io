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
    const side = 54;
    const sample = document.createElement("canvas");
    sample.width = sample.height = side;
    const brush = sample.getContext("2d");
    brush.drawImage(image, 0, 0, side, side);
    const pixels = brush.getImageData(0, 0, side, side).data;
    const stars = [];
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        const u = (col + .5) / side, v = (row + .5) / side;
        if (Math.hypot(u - .5, v - .5) > .495) continue;
        const i = (row * side + col) * 4;
        stars.push({
          u, v, angle: Math.random() * Math.PI * 2,
          radius: .32 + Math.random() * .58,
          delay: Math.random() * 1450,
          bend: (Math.random() - .5) * 1.28,
          color: 'rgb(' + pixels[i] + ',' + pixels[i+1] + ',' + pixels[i+2] + ')',
          glint: Math.random() > .92
        });
      }
    }

    let width, height, left, top, diameter;
    function measure() {
      const area = canvas.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      width = area.width; height = area.height;
      diameter = photo.width;
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
      const reveal = limit((elapsed - 3900) / 1250);
      if (reveal === 1 || motionPreference.matches) {
        sizeObserver.disconnect();
        canvas.hidden = true;
        image.style.opacity = "1";
        return;
      }
      image.style.opacity = String(reveal);
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const travel = limit((elapsed - star.delay) / 2500);
        const ease = travel * travel * (3 - 2 * travel);
        const remaining = 1 - ease;
        const direction = star.angle + star.bend * ease;
        const x = left + star.u * diameter + Math.cos(direction) * width * star.radius * remaining;
        const y = top + star.v * diameter + Math.sin(direction) * height * star.radius * remaining;
        const radius = .6 + ease * diameter / side * .35;
        context.globalAlpha = (1 - reveal) * (.24 + ease * .76) * limit((elapsed + 200 - star.delay) / 500);
        context.fillStyle = ease > .76 ? star.color : star.glint ? "#ffdca7" : "#d7ddff";
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        if (star.glint && travel > .04 && travel < .91) {
          context.fillRect(x - 3, y, 6, .7);
          context.fillRect(x, y - 3, .7, 6);
        }
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  } catch {
    image.style.opacity = "1";
    canvas.hidden = true;
  }
}

function orbitNavigation() {
  const map = document.querySelector(".orbit-map");
  const worlds = Array.from(map.querySelectorAll(".world"));
  const toggle = document.querySelector(".orbit-toggle");
  const tracks = [.64, .82, 1].map(scale => {
    const ring = document.createElement("span");
    ring.className = "track";
    ring.setAttribute("aria-hidden", "true");
    map.prepend(ring);
    return {ring, scale};
  });
  const diameters = [45, 51, 36, 57, 36, 43, 47, 35, 32];
  const lanes = [1, 2, 0, 2, 1, 2, 0, 2, 1];
  let phase = 0, frame = 0, previous = 0, visible = false;
  let paused = motionPreference.matches, pointing = false;
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
  function place() {
    const positions = worlds.map((world, i) => {
      const lane = tracks[lanes[i]].scale;
      const angle = -Math.PI * .82 + phase + i * 2 * Math.PI / worlds.length;
      const x = width / 2 + radiusX * lane * Math.cos(angle);
      const y = height / 2 + radiusY * lane * Math.sin(angle) + sizes[i].offset;
      return {x, y};
    });
    separateTargets(positions);
    worlds.forEach((world, i) => {
      const {x, y} = positions[i];
      world.style.setProperty("--x", x.toFixed(2) + "px");
      world.style.setProperty("--y", y.toFixed(2) + "px");
    });
  }
  function measure() {
    width = map.clientWidth; height = map.clientHeight;
    sizes = worlds.map(world => ({
      w: world.offsetWidth, h: world.offsetHeight,
      offset: (world.offsetHeight - world.querySelector(".globe").offsetHeight) / 2 - 4
    }));
    radiusX = Math.max(1, width / 2 - (width < 440 ? 49 : 65));
    radiusY = Math.max(1, height / 2 - 46);
    tracks.forEach(({ring, scale}) => {
      ring.style.width = 2 * radiusX * scale + "px";
      ring.style.height = 2 * radiusY * scale + "px";
    });
    place();
  }
  function tick(time) {
    if (previous) phase += Math.min((time - previous) / 1000, .1) * .044;
    previous = time;
    place();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = 0;
    toggle.textContent = paused ? "Resume orbits" : "Pause orbits";
    if (visible && !paused && !pointing && !document.hidden && !map.matches(":focus-within")) {
      frame = requestAnimationFrame(tick);
    }
  }
  worlds.forEach((world, i) => world.style.setProperty("--diameter", diameters[i] + "px"));
  map.classList.add("ready");
  measure();
  toggle.hidden = false;
  toggle.addEventListener("click", () => { paused = !paused; sync(); });
  map.addEventListener("pointerover", event => { pointing = !!event.target.closest(".world"); sync(); });
  map.addEventListener("pointerleave", () => { pointing = false; sync(); });
  map.addEventListener("pointerdown", () => { pointing = true; sync(); });
  map.addEventListener("focusin", sync);
  map.addEventListener("focusout", () => queueMicrotask(sync));
  motionPreference.addEventListener("change", () => { paused = motionPreference.matches; sync(); });
  document.addEventListener("visibilitychange", sync);
  new ResizeObserver(measure).observe(map);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) map.classList.add("charted");
    sync();
  }).observe(map);
  sync();
}

gatherPortrait();
orbitNavigation();
