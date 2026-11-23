// Longitudes wrap through the texture while the light remains directed toward
// the sun. Cache the spherical projection once per body, including its tilt.
const mapWidth = 512;
const mapHeight = 256;
const tau = Math.PI * 2;
const tilts = [23.4,25.2,3.1,26.7,.03,97.8,177.4,28.3,4,7.3];
// Visual day lengths in seconds; scales are compressed for navigation.
const days = [10,12,7,8.5,17,11,18,10,9,42];
// Scattered light at the atmospheric limb. Airless worlds keep a crisp edge.
const atmospheres = [[52,115,235],[120,60,24],[69,51,30],[75,61,38],
  [0,0,0],[39,107,121],[125,87,42],[35,68,148],[0,0,0],[0,0,0]];

function surface(host, index, atlas) {
  const sun = index === 9, ringed = index === 3;
  const extent = ringed ? 2.25 : 1;
  const size = Math.round((sun ? 112 : 104) * extent);
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
          rim:(1-nz)**2.6, wind:Math.cos(axisY*4.4)*Math.cos(axisY*1.5),
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
  const alpha=field("alpha",Uint8Array), rim=field("rim",Float32Array);
  const wind=field("wind",Float32Array), tint=atmospheres[index], data=frame.data;
  host.append(canvas);
  host.classList.add("mapped-surface");
  if (ringed) host.classList.add("ringed");
  return (seconds,angle) => {
    const shift = (.53 - seconds / days[index]) * mapWidth;
    const drift = index===2 || index===3 ? 6*Math.sin(seconds*.21) : 0;
    const lx = -Math.cos(angle), ly = Math.sin(angle)*.74, lz = -Math.sin(angle)*.673;
    const halfLength = Math.hypot(lx,ly,1+lz);
    const hx=lx/halfLength, hy=ly/halfLength, hz=(1+lz)/halfLength;
    const cloudDrift = 2.4 + seconds*.38;
    const ringLight = .94*(lx*sin+ly*cos)+.34*lz;
    for (let i=0; i<dst.length; i++) {
      const longitude=u[i]+shift+drift*wind[i], col=Math.floor(longitude), blend=longitude-col;
      const a=(row[i]+(col & 511))*4, b=(row[i]+((col+1) & 511))*4, p=dst[i];
      const light=nx[i]*lx+ny[i]*ly+nz[i]*lz;
      const daylight=Math.max(0,light);
      let shade=sun ? .68+.49*nz[i] : .27+.82*Math.sqrt(daylight)+.08*nz[i];
      if(ringed && daylight>0 && Math.abs(ringLight)>.01) {
        // Trace from the lit surface towards the sun through the ring plane.
        const travel=-(.94*(nx[i]*sin+ny[i]*cos)+.34*nz[i])/ringLight;
        if(travel>0) {
          const radius=Math.sqrt(1+2*travel*light+travel*travel);
          if(radius>=1.22 && radius<=2.16) {
            const band=Math.floor((radius-1.22)/.94*(mapWidth-1));
            shade*=1-.51*atlas[((10*mapHeight+2)*mapWidth+band)*4+3]/255;
          }
        }
      }
      const haze=rim[i]*(.11+.85*daylight);
      let cloud=0;
      if(index===0) {
        const pos=longitude+cloudDrift+wind[i]*1.7, cell=Math.floor(pos);
        const cloudRow=2564*mapWidth+row[i];
        const first=atlas[(cloudRow+(cell&511))*4], next=atlas[(cloudRow+((cell+1)&511))*4];
        cloud=(first+(next-first)*(pos-cell))/255*.94;
      }
      const ocean=index===0 && atlas[a+2]>atlas[a]*1.28 && light>0;
      const glint=ocean ? 90*Math.max(0,nx[i]*hx+ny[i]*hy+nz[i]*hz)**28 : 0;
      for(let c=0;c<3;c++) {
        const color=atlas[a+c]+(atlas[b+c]-atlas[a+c])*blend;
        data[p+c]=(color+(248-color)*cloud)*shade+tint[c]*haze+glint*(1-cloud);
      }
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

// At navigation scale Saturn and the ice giants lose most of their subtle
// longitudinal detail. Blend a few illustrative storm ovals and methane
// cloud streaks into their albedo maps, before projection and illumination.
function cloudFeature(atlas, index, longitude, latitude, span, depth, pigment, strength) {
  const latitudeRow = (90-latitude)*mapHeight/180;
  const radiusY = depth*mapHeight/180;
  const top = Math.max(0, Math.floor(latitudeRow-radiusY*3));
  const bottom = Math.min(mapHeight-1, Math.ceil(latitudeRow+radiusY*3));
  for(let y=top;y<=bottom;y++) {
    for(let x=0;x<mapWidth;x++) {
      const degrees=(x/mapWidth*360-longitude+540)%360-180;
      const dx=degrees/span;
      if(Math.abs(dx)>2.8) continue;
      const dy=(y-latitudeRow)/radiusY + .25*Math.sin(2.8*dx);
      const weight=strength*Math.exp(-dx*dx-dy*dy) * (.9+.1*Math.cos(5*dx+dy));
      const p=((index*mapHeight+y)*mapWidth+x)*4;
      for(let c=0;c<3;c++) atlas[p+c]+=(pigment[c]-atlas[p+c])*weight;
    }
  }
}

export async function loadSurfaces(hosts) {
  const image = new Image();
  image.src = new URL("surfaces.webp?v=2", import.meta.url).href;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image,0,0);
  const atlas = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  cloudFeature(atlas,3,27,35,20,3,[253,233,191],.55);
  cloudFeature(atlas,5,40,-26,21,3.8,[225,249,246],.82);
  cloudFeature(atlas,5,209,34,16,3,[219,244,247],.74);
  cloudFeature(atlas,7,24,-22,17,7,[21,44,103],.85);
  cloudFeature(atlas,7,35,-30,16,2.6,[215,230,248],.85);
  cloudFeature(atlas,7,198,27,22,3,[177,203,247],.67);
  return hosts.map((host,i)=>surface(host,i,atlas));
}
