// A cubic arc keeps the velocity tangent continuous as a free-flying dragon approaches a wall.
// All four control points lie inside the flight area, including when a flick starts in a corner.
export function planEdgeTurn(x,y,vx,vy,box,size) {
  const speed=Math.hypot(vx,vy);
  if(speed<30) return null;
  const dx=vx/speed,dy=vy/speed;
  const look=Math.min(size*.45, Math.max(size*.17,speed*.34));
  const walls=[
    {nx:1,ny:0,gap:box.right-x},{nx:-1,ny:0,gap:x-box.left},
    {nx:0,ny:1,gap:box.bottom-y},{nx:0,ny:-1,gap:y-box.top}
  ];
  let wall,soonest=Infinity;
  for(const w of walls) {
    const toward=w.nx*dx+w.ny*dy;
    if(toward<=.24) continue;
    const distance=w.gap/toward;
    if(distance<=look && distance<soonest) {wall=w;soonest=distance;}
  }
  if(!wall) return null;
  const {nx,ny}=wall;
  let tx=-ny,ty=nx;
  const along=tx*dx+ty*dy;
  const centerward=tx*((box.left+box.right)/2-x)+ty*((box.top+box.bottom)/2-y);
  if((Math.abs(along)>.36 ? along : centerward)<0) {tx=-tx;ty=-ty;}
  const tangentRoom=(ux,uy)=>ux>0 ? box.right-x : ux<0 ? x-box.left : uy>0 ? box.bottom-y : y-box.top;
  const span=Math.min(size*.65, Math.max(size*.32,speed*.35));
  if(tangentRoom(tx,ty)<span*.8 && tangentRoom(-tx,-ty)>tangentRoom(tx,ty)) {tx=-tx;ty=-ty;}
  const stride=Math.min(span,tangentRoom(tx,ty)*.86);
  const depth=Math.min(size*.28, (nx ? box.right-box.left : box.bottom-box.top)*.24);
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
  const point=(px,py)=>({x:clamp(px,box.left,box.right),y:clamp(py,box.top,box.bottom)});
  const exit=point(x+stride*tx-depth*nx,y+stride*ty-depth*ny);
  const lead=Math.max(0,Math.min(soonest*.92,span*.82));
  const p1=point(x+dx*lead,y+dy*lead);
  const p2=point(exit.x+nx*depth*1.35-tx*stride*.12,exit.y+ny*depth*1.35-ty*stride*.12);
  const curve={start:{x,y},p1,p2,exit,time:0};
  // Measure the arc so speed is independent of the spacing between its control points.
  const distances=[0];
  let previous=curve.start;
  for(let i=1;i<=32;i++) {
    const next=sample(curve,i/32);
    distances.push(distances[i-1]+Math.hypot(next.x-previous.x,next.y-previous.y));
    previous=next;
  }
  const length=distances[distances.length-1];
  if(length<1) return null;
  curve.distances=distances;
  curve.duration=clamp(length/Math.max(70,speed*.74),.57,1.6);
  const mean=length/curve.duration;
  curve.entry=clamp(speed/mean,.5,2.1);
  curve.leave=clamp(speed*.67/mean,.45,1.15);
  return curve;
}
function sample({start,p1,p2,exit},t) {
  const u=1-t;
  const pos=k=>u*u*u*start[k]+3*u*u*t*p1[k]+3*u*t*t*p2[k]+t*t*t*exit[k];
  const tangent=k=>3*(u*u*(p1[k]-start[k])+2*u*t*(p2[k]-p1[k])+t*t*(exit[k]-p2[k]));
  return {x:pos('x'),y:pos('y'),dx:tangent('x'),dy:tangent('y')};
}
export function advanceEdgeTurn(curve,dt) {
  curve.time+=dt;
  const t=Math.min(1,curve.time/curve.duration), u=1-t;
  const {distances,entry,leave}=curve;
  const segments=distances.length-1, length=distances[segments];
  // Hermite easing carries approach speed into the turn and releases the dragon into its glide.
  const distance=length*(t*t*(3-2*t)+entry*t*u*u-leave*t*t*u);
  const speed=length/curve.duration*(6*t*u+entry*u*(1-3*t)+leave*t*(3*t-2));
  let i=1;
  while(i<segments && distances[i]<distance) i++;
  const fraction=(distance-distances[i-1])/Math.max(.0001,distances[i]-distances[i-1]);
  const p=sample(curve,(i-1+fraction)/segments);
  const norm=Math.max(.0001,Math.hypot(p.dx,p.dy));
  return {x:p.x,y:p.y,vx:p.dx/norm*speed,vy:p.dy/norm*speed,done:t===1};
}
