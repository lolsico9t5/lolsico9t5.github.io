// Self-hosted sculpt, skeletal flight clips and perspective camera for the space dragon.
import {
  AnimationMixer, DirectionalLight, GLTFLoader, Group, HemisphereLight,
  MathUtils, PerspectiveCamera, PointLight, Scene, Vector3, WebGLRenderer
} from "./vendor/three-flight.module.js?v=7";

export async function createDragonModel(canvas, url) {
  const renderer = new WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:"low-power"});
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  let asset;
  try {
    asset = await new GLTFLoader().loadAsync(url);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, .1, 60);
  camera.position.set(0, 4.0, 13.2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(new HemisphereLight(0xdde5ff, 0x4d4162, 1.08));
  function light(color, intensity, x, y, z) {
    const lamp = new DirectionalLight(color, intensity);
    lamp.position.set(x,y,z);
    scene.add(lamp);
    return lamp;
  }
  const key = light(0xffe4c1, 2.55, -4, 7, 5);
  key.castShadow = true;
  Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.5,far:23});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(512,512);
  key.shadow.normalBias=.023;
  key.shadow.bias=-.00045;
  light(0xa8bdff, 2.9, 3, 4, -5);
  light(0xa88deb, .86, 2, -1, 3);

  // The yaw, pitch and roll axes turn with the airframe. Banking reveals the far wing.
  const airframe = new Group();
  scene.add(airframe);
  const model = asset.scene;
  model.position.set(.65,-.20,0);
  airframe.add(model);
  let eyes;
  model.traverse(node => {
    if (!node.isSkinnedMesh) return;
    node.frustumCulled = false;
    node.castShadow = !node.material.transparent;
    node.receiveShadow = true;
    const material = node.material;
    if (material.name === "Hide") {
      material.roughness = .39;
      material.metalness = .18;
      // Rest-space coordinates keep each scale attached to the animated skin.
      material.onBeforeCompile = shader => {
        shader.vertexShader = "varying vec3 hidePoint;\n"+shader.vertexShader.replace(
          "#include <begin_vertex>", "#include <begin_vertex>\nhidePoint = position;");
        shader.fragmentShader = "varying vec3 hidePoint;\n"+shader.fragmentShader.replace(
          "#include <color_fragment>", `#include <color_fragment>
          vec2 grid = vec2(hidePoint.x * 8.0, atan(hidePoint.y - .08, hidePoint.z) * 2.55);
          grid.x += .5 * mod(floor(grid.y), 2.0);
          vec2 cell = fract(grid) - .5;
          float scallop = length(vec2(cell.x, (cell.y + .25) * .84));
          float aa = clamp(fwidth(scallop), .035, .25);
          float ridge = 1.0 - smoothstep(.03, .03+aa, abs(scallop-.45));
          diffuseColor.rgb *= mix(vec3(.68,.78,.99), vec3(.99,1.04,1.10), ridge);`).replace(
          "#include <opaque_fragment>", `float pearl = pow(1.0 - clamp(dot(normal,normalize(vViewPosition)),0.0,1.0), 3.0);
          outgoingLight += diffuseColor.rgb*vec3(.12,.14,.20) + vec3(.065,.105,.22)*pearl;
          #include <opaque_fragment>`);
      };
    } else if (material.name === "Wing silk") {
      material.color.setHex(0xc9c5fa);
      material.roughness = .50;
    } else if (material.name === "Eye") {
      eyes = material;
      eyes.emissive.setHex(0xffab43);
    }
  });
  const mixer = new AnimationMixer(model);
  const clip = name => mixer.clipAction(asset.animations.find(a=>a.name===name)).play();
  const flap = clip("Flight"), glide = clip("Glide");
  const bones = name => model.getObjectByName(name);
  const tail = Array.from({length:6}, (_,i)=>bones("Tail"+(i+1)));
  const head = bones("Head"), jaw = bones("Jaw");
  const lips = bones("Muzzle"), throat = bones("Throat");
  const firelight = new PointLight(0xffa25e,0,1.75);
  firelight.position.set(.18,.02,.05);
  lips.add(firelight);
  const neck = bones("Neck2");
  const wrists = [bones("WingWristL"),bones("WingWristR")];
  const secondary = [...tail, ...wrists, neck, head, jaw].map(node => ({node, base:node.quaternion.clone()}));
  const tailBank = new Float32Array(tail.length);
  const snout = new Vector3(), rear = new Vector3();
  let lastWidth=0, lastHeight=0;

  let depth=0, flightTime=0;
  function render({dt, heading, pitch, roll, pace, wingLoad, heat, tailLean, size, steerLead=0, wingCycle}) {
    if (lastWidth!==canvas.width || lastHeight!==canvas.height) {
      lastWidth=canvas.width; lastHeight=canvas.height;
      renderer.setSize(lastWidth,lastHeight,false);
      camera.aspect=lastWidth/lastHeight;
      camera.updateProjectionMatrix();
    }
    const flight = MathUtils.smoothstep(pace,.035,.31);
    flightTime+=dt;
    const soaring = flight*(1-MathUtils.smoothstep(wingLoad,.26,.86));
    flap.setEffectiveWeight(1-soaring).setEffectiveTimeScale(.88+.34*wingLoad);
    glide.setEffectiveWeight(soaring).setEffectiveTimeScale(.88);
    // Restore the previous animated pose before mixing, so offsets never accumulate.
    for (const joint of secondary) joint.node.quaternion.copy(joint.base);
    mixer.update(dt);
    if(wingCycle!==undefined) {
      flap.time=wingCycle*flap.getClip().duration;
      mixer.update(0);
    }
    for (const joint of secondary) joint.base.copy(joint.node.quaternion);
    for (let i=0;i<tail.length;i++) {
      const bend=(i+1)/tail.length;
      const upstream=i===0?roll:tailBank[i-1];
      tailBank[i]+=(upstream-tailBank[i])*(1-Math.exp(-13*dt));
      const ripple = Math.sin(flightTime*2.4-i*.6)*(.014+.045*bend)*flight;
      tail[i].rotateY(tailBank[i]*(.06+.11*bend)+ripple);
      tail[i].rotateX(-tailLean*.055*bend);
    }
    // Tuck the inside wing slightly. Let the extended outside wing carry the bank.
    wrists[0].rotateY(Math.max(0,roll)*.21);
    wrists[1].rotateY(Math.min(0,roll)*.21);
    const stroke = Math.sin(wingCycle*2*Math.PI);
    neck.rotateZ(stroke*wingLoad*.025);
    neck.rotateY(-steerLead*.19);
    head.rotateY(-steerLead*.13-roll*.10);
    head.rotateZ(pitch*.13-stroke*wingLoad*.015);
    jaw.rotateZ(-heat*.25);
    airframe.rotation.set(roll,-heading,-pitch+stroke*wingLoad*.026,"YZX");
    depth+=(Math.sin(heading)*Math.min(1,pace*2.6)*.72-depth)*(1-Math.exp(-3*dt));
    airframe.position.z=depth;
    firelight.intensity=heat*(2.0+.25*Math.sin(flightTime*29));
    if (eyes) eyes.emissiveIntensity=.82+.65*heat;
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
