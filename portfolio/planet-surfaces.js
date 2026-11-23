// Longitudes wrap through the texture while the light remains directed toward
// the sun. Cache the spherical projection once per body, including its tilt.
const mapWidth = 512;
const mapHeight = 256;
const tau = Math.PI * 2;
const tilts = [23.4,25.2,3.1,26.7,.03,97.8,177.4,28.3,4,7.3];
// Visual day lengths in seconds; scales are compressed for navigation.
const days = [35,37,17,19,85,27,105,26,22,90];

function surface(host, index, atlas) {
  const sun = index === 9, ringed = index === 3;
  const extent = ringed ? 2.25 : 1;
  const size = Math.round((sun ? 112 : 88) * extent);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const frame = ctx.createImageData(size,size);
  const layers = [];
  const tilt = tilts[index] * Math.PI / 180;
  const sin = Math.sin(tilt), cos = Math.cos(tilt);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = extent * (2 * (x+.5) / size - 1);
      const ny = extent * (1 - 2 * (y+.5) / size);
      const squared = nx*nx + ny*ny;
      const nz = Math.sqrt(Math.max(0,1-squared));
      const pixel = (y*size+x)*4;
      if (squared < 1) {
        const axisY = Math.max(-1,Math.min(1,ny*cos + nx*sin));
        const u = (.5 + Math.atan2(nx*cos-ny*sin,nz)/tau)*mapWidth;
        const v = Math.min(mapHeight-1,Math.floor((.5-Math.asin(axisY)/Math.PI)*mapHeight));
        layers.push({pixel,nx,ny,nz,u,row:(index*mapHeight+v)*mapWidth,
          alpha:Math.min(1,(1-Math.sqrt(squared))*size/(2*extent))*255});
      }
      if (ringed) {
        const along = nx*cos-ny*sin, across = nx*sin+ny*cos;
        const radius = Math.hypot(along,across/.34);
        const depth = -across/.34*.94;
        if (radius < 1.22 || radius > 2.16 || (squared < 1 && depth < nz)) continue;
        const column = Math.floor((radius-1.22)/.94*(mapWidth-1));
        // Use source alpha for the Cassini division and the thin outer rings.
        const ring = ((10*mapHeight+2)*mapWidth+column)*4;
        layers.push({pixel,ring,nx,ny,nz:depth});
      }
    }
  }
  // Typed arrays keep the hot loop compact on phones.
  const body = layers.filter(p => p.ring === undefined);
  const rings = layers.filter(p => p.ring !== undefined);
  const field = (key, Type) => Type.from(body,p=>p[key]);
  const dst=field("pixel",Uint32Array), u=field("u",Float32Array), row=field("row",Uint32Array);
  const nx=field("nx",Float32Array), ny=field("ny",Float32Array), nz=field("nz",Float32Array);
  const alpha=field("alpha",Uint8Array), data=frame.data;
  host.append(canvas);
  host.classList.add("mapped-surface");
  if (ringed) host.classList.add("ringed");
  return (seconds,angle) => {
    const shift = (.53 - seconds / days[index]) * mapWidth;
    const lx = -Math.cos(angle), ly = Math.sin(angle)*.48, lz = -Math.sin(angle)*.877;
    for (let i=0; i<dst.length; i++) {
      const longitude=u[i]+shift, col=Math.floor(longitude), blend=longitude-col;
      const a=(row[i]+(col & 511))*4, b=(row[i]+((col+1) & 511))*4, p=dst[i];
      const light=nx[i]*lx+ny[i]*ly+nz[i]*lz;
      const shade=sun ? .76+.40*nz[i] : .34+.77*Math.max(0,light);
      for(let c=0;c<3;c++) data[p+c]=(atlas[a+c]+(atlas[b+c]-atlas[a+c])*blend)*shade;
      data[p+3]=alpha[i];
    }
    for (const r of rings) {
      const opacity=atlas[r.ring+3]/255;
      const dot=r.nx*lx+r.ny*ly+r.nz*lz;
      const shadow=dot<0 && r.nx*r.nx+r.ny*r.ny+r.nz*r.nz-dot*dot<1;
      const shade = shadow ? .33 : .86;
      const p=r.pixel, under=r.nx*r.nx+r.ny*r.ny<1;
      for(let c=0;c<3;c++) {
        const color=atlas[r.ring+c]*shade;
        data[p+c]=under ? data[p+c]*(1-opacity)+color*opacity : color;
      }
      if(!under) data[p+3]=atlas[r.ring+3];
    }
    ctx.putImageData(frame,0,0);
  };
}

export async function loadSurfaces(hosts) {
  const image = new Image();
  image.src = new URL("surfaces.webp", import.meta.url).href;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image,0,0);
  const atlas = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  return hosts.map((host,i)=>surface(host,i,atlas));
}
