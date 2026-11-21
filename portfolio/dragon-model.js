// Self-hosted sculpt, skeletal flight clips and perspective camera for the space dragon.
import {
  AnimationMixer, DirectionalLight, GLTFLoader, Group, HemisphereLight,
  MathUtils, PerspectiveCamera, Scene, Vector3, WebGLRenderer
} from "./vendor/three-flight.module.js";

export async function createDragonModel(canvas, url) {
  const renderer = new WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:"low-power"});
  renderer.setClearColor(0x000000, 0);
  let asset;
  try {
    asset = await new GLTFLoader().loadAsync(url);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, .1, 60);
  camera.position.set(0, 4.0, 13.2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(new HemisphereLight(0xf2e9ff, 0x777393, 1.65));
  function light(color, intensity, x, y, z) {
    const lamp = new DirectionalLight(color, intensity);
    lamp.position.set(x,y,z);
    scene.add(lamp);
  }
  light(0xffe6e0, 2.0, -4, 7, 6);
  light(0xc4a3ff, 2.4, 3, 4, -5);
  light(0x8ba8ff, .65, 2, -1, 3);

  // The yaw, pitch and roll axes turn with the airframe. Banking reveals the far wing.
  const airframe = new Group();
  scene.add(airframe);
  const model = asset.scene;
  model.position.set(.65,-.20,0);
  airframe.add(model);
  model.traverse(node => {
    if (node.isSkinnedMesh) node.frustumCulled = false;
  });
  const mixer = new AnimationMixer(model);
  const clip = name => mixer.clipAction(asset.animations.find(a=>a.name===name)).play();
  const flap = clip("Flight"), glide = clip("Glide");
  const bones = name => model.getObjectByName(name);
  const tail = Array.from({length:6}, (_,i)=>bones("Tail"+(i+1)));
  const head = bones("Head"), jaw = bones("Jaw");
  const lips = bones("Muzzle"), throat = bones("Throat");
  const wrists = [bones("WingWristL"),bones("WingWristR")];
  const secondary = [...tail, ...wrists, head, jaw].map(node => ({node, base:node.quaternion.clone()}));
  const tailBank = new Float32Array(tail.length);
  const snout = new Vector3(), rear = new Vector3();
  let lastWidth=0, lastHeight=0;

  function render({dt, heading, pitch, roll, pace, wingLoad, heat, tailLean, size}) {
    if (lastWidth!==canvas.width || lastHeight!==canvas.height) {
      lastWidth=canvas.width; lastHeight=canvas.height;
      renderer.setSize(lastWidth,lastHeight,false);
      camera.aspect=lastWidth/lastHeight;
      camera.updateProjectionMatrix();
    }
    const flight = MathUtils.smoothstep(pace,.035,.31);
    const soaring = flight*(1-MathUtils.smoothstep(wingLoad,.26,.86));
    flap.setEffectiveWeight(1-soaring).setEffectiveTimeScale(.88+.34*wingLoad);
    glide.setEffectiveWeight(soaring).setEffectiveTimeScale(.88);
    // Restore the previous animated pose before mixing, so offsets never accumulate.
    for (const joint of secondary) joint.node.quaternion.copy(joint.base);
    mixer.update(dt);
    for (const joint of secondary) joint.base.copy(joint.node.quaternion);
    for (let i=0;i<tail.length;i++) {
      const bend=(i+1)/tail.length;
      const upstream=i===0?roll:tailBank[i-1];
      tailBank[i]+=(upstream-tailBank[i])*(1-Math.exp(-13*dt));
      tail[i].rotateY(tailBank[i]*(.06+.11*bend));
      tail[i].rotateX(-tailLean*.055*bend);
    }
    // Tuck the inside wing slightly. Let the extended outside wing carry the bank.
    wrists[0].rotateY(Math.max(0,roll)*.21);
    wrists[1].rotateY(Math.min(0,roll)*.21);
    head.rotateY(-roll*.18);
    jaw.rotateZ(-heat*.25);
    airframe.rotation.set(roll,-heading,-pitch,"YZX");
    renderer.render(scene,camera);
    // Project the animated mouth and its direction through the same camera as the mesh.
    lips.getWorldPosition(snout).project(camera);
    throat.getWorldPosition(rear).project(camera);
    const w=size*1.22/2, h=size*.82/2;
    let dx=(snout.x-rear.x)*w, dy=(rear.y-snout.y)*h;
    const length=Math.hypot(dx,dy);
    if (length>.04) { dx/=length; dy/=length; }
    else { dx=0; dy=1; }
    return {x:snout.x*w,y:-snout.y*h,dx,dy};
  }
  function dispose() {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.traverse(node=>{
      if (!node.isMesh) return;
      node.geometry.dispose();
      node.skeleton?.dispose();
      for (const mat of [].concat(node.material)) {
        mat.map?.dispose(); mat.dispose();
      }
    });
    renderer.dispose();
  }
  return {render,dispose};
}
