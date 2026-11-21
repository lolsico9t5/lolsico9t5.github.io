// A texture mesh lets the pinions fold at the shoulder while the neck and tail lag the torso.
const vertex = `
attribute vec2 uv;
uniform float phase;
uniform float bank;
uniform mediump float breath;
uniform mediump float jawPass;
uniform float speed;
varying vec2 tex;
varying float light;
uniform int view;
uniform float effort;
uniform float tailLean;
uniform vec2 placement;

// Texture coordinates have a 2:1 aspect. Rotate bones in equal physical units.
vec2 pivot(vec2 p,vec2 joint,float angle) {
  vec2 limb=(p-joint)*vec2(2.0,1.0);
  float c=cos(angle),s=sin(angle);
  return joint+vec2(c*limb.x-s*limb.y,s*limb.x+c*limb.y)/vec2(2.0,1.0);
}
float stroke(float t) {
  return .5-.5*cos(t+.40*(1.0-cos(t)));
}
vec2 articulate(vec2 p,vec2 shoulder,vec2 wrist,float span,float mask,float handed,float stagger) {
  float distanceOut=clamp((p.x-shoulder.x)*handed/span,0.0,1.0);
  float wristBlend=smoothstep(.02,.44,(p.x-wrist.x)*handed/span+.13);
  float t=2.0*phase+stagger;
  float press=stroke(t);
  float trailing=smoothstep(-.14,.18,p.y-wrist.y);
  float delayed=stroke(t-.24-.48*distanceOut-.19*trailing);
  // The shoulder drives the downstroke. The wrist opens on the push, then
  // folds inboard during recovery while the membrane catches up with the spars.
  float recovery=smoothstep(.0,.92,-sin(t-.29));
  float upper=handed*((press-.29)*.56*effort+.065*bank*handed);
  float wristAngle=handed*((delayed-press)*.76 + (delayed-.38)*.24)*effort;
  vec2 bent=p;
  bent.x-=handed*span*.19*distanceOut*recovery*effort;
  bent=mix(bent,pivot(bent,wrist,wristAngle),wristBlend);
  bent=pivot(bent,shoulder,upper);
  float tip=distanceOut*distanceOut;
  bent.y+=tip*trailing*effort*.027*sin(t-.95-distanceOut);
  light+=mask*((.7-press)*.12 + (delayed-press)*.09)*effort;
  return mask*(bent-p);
}
void main() {
  tex=uv;light=0.0;
  float x=uv.x,y=uv.y;
  vec2 pos=uv;
  if(view==2) {
    float span=abs(x-.5);
    float mask=smoothstep(.060,.125,span);
    mask*=1.0-(1.0-smoothstep(.11,.20,span))*smoothstep(.50,.59,y);
    float hand=x<.5?-1.0:1.0;
    pos+=articulate(uv,vec2(.5+hand*.062,.49),vec2(.5+hand*.188,.306),
                     .409,mask,hand,hand*(.045+.08*bank));
  } else if(view==1) {
    float nearMask=(1.0-smoothstep(.53,.615,x))*(1.0-smoothstep(.312+.50*x,.360+.49*x,y));
    float farMask=smoothstep(.68,.80,x)*(1.0-smoothstep(.24+.58*(x-.65),.30+.66*(x-.65),y));
    pos+=articulate(uv,vec2(.586,.563),vec2(.402,.24),.53,nearMask,-1.0,0.0);
    pos+=articulate(uv,vec2(.766,.39),vec2(.91,.19),.173,farMask,1.0,.11+.12*bank);
  } else {
    float wing=(1.0-smoothstep(.65,.755,x))*(1.0-smoothstep(.455+.275*x,.58+.25*x,y));
    pos+=articulate(uv,vec2(.703,.65),vec2(.665,.332),.675,wing,-1.0,0.0);
    // In profile the upper arm points almost at the camera. Its visible stroke
    // drops the wrist and draws it back into the shoulder on the return.
    float arm=wing*smoothstep(.0,.32,.65-y);
    pos.y+=arm*.115*stroke(2.0*phase)*effort;
    pos.x-=arm*.023*sin(2.0*phase)*effort;
    float tail=(1.0-smoothstep(.15,.65,x))*smoothstep(.48,.64,y);
    float head=smoothstep(.72,.96,x);
    float reach=1.0-smoothstep(.05,.67,x);
    float wave=2.0*phase-3.1*reach;
    pos.y += tail * ((.021+.032*effort)*sin(wave) + reach*tailLean*.092 + bank*.020);
    pos.x += tail * (.006+.008*speed)*sin(wave-.6);
    pos.y += head * (.010*sin(2.0*phase+.5) - .008*bank);
    pos.y += .007*cos(2.0*phase)*(y-.68);
    pos.x -= breath * .012 * head;
    pos.y -= breath * .022 * head;
    if (jawPass > .5) {
      vec2 hinge = vec2(.89,.516);
      vec2 bone = (uv-hinge)*vec2(1.0,.505);
      float gape = breath*.31*smoothstep(.88,.94,x);
      mat2 rotateJaw = mat2(cos(gape),sin(gape),-sin(gape),cos(gape));
      pos += (rotateJaw*bone-bone)/vec2(1.0,.505);
    }
    pos = vec2(.055,.075) + pos*vec2(.89,.86);
  }
  pos.x=(pos.x-.5)*placement.y+.5+placement.x;
  gl_Position = vec4((pos.x*2.0-1.0)/1.22, (1.0-pos.y*2.0)/1.64, 0.0, 1.0);
}`;
const fragment = `
precision mediump float;
uniform sampler2D dragon;
uniform float opacity;
uniform mediump float breath;
uniform mediump float jawPass;
varying vec2 tex;
varying float light;
void main() {
  vec4 sampleColor = texture2D(dragon, tex);
  float lip = .514 + .30*(tex.x-.885) + .003*sin(29.0*(tex.x-.885));
  bool lowerJaw = tex.x>.885 && tex.y>lip && tex.y<lip+.065;
  if (jawPass>=0.0 && lowerJaw != (jawPass>.5)) discard;
  float warmth = breath*smoothstep(.69,.98,tex.x)*(1.0-smoothstep(.03,.19,abs(tex.y-lip)));
  gl_FragColor = vec4(sampleColor.rgb * (1.0 + light) + vec3(.46,.15,.025)*warmth*sampleColor.a, sampleColor.a)*opacity;
}`;

export function createWingRig(canvas, image, turnImages=[]) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [stage, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(stage);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const columns = 64, rows = 40, vertices = [], indices = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      vertices.push(x / columns, y / rows);
      if (x === columns || y === rows) continue;
      const a = y*(columns+1)+x, b = a+columns+1;
      indices.push(a,b,a+1, a+1,b,b+1);
    }
  }
  const mesh = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const coord = gl.getAttribLocation(program, "uv");
  gl.enableVertexAttribArray(coord);
  gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  const textures=[image,...turnImages].map(source=>{
    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    return texture;
  });
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const angle = gl.getUniformLocation(program, "phase");
  const lean = gl.getUniformLocation(program, "bank");
  const breath = gl.getUniformLocation(program,"breath");
  const jaw = gl.getUniformLocation(program,"jawPass");
  const speed = gl.getUniformLocation(program,"speed");
  const view=gl.getUniformLocation(program,"view");
  const effort=gl.getUniformLocation(program,"effort");
  const tail=gl.getUniformLocation(program,"tailLean");
  const placement=gl.getUniformLocation(program,"placement");
  const opacity=gl.getUniformLocation(program,"opacity");
  const profileOnly=[{weight:1,shift:0,scale:1}];
  return (phase,bank=0,heat=0,pace=0,load=.85,poses=profileOnly,tailLean=0)=>{
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(angle,phase);gl.uniform1f(lean,bank);
    gl.uniform1f(speed,pace);gl.uniform1f(effort,load);
    gl.uniform1f(tail,tailLean);
    for(let i=0;i<poses.length;i++) {
      const pose=poses[i];
      if(pose.weight<.001 || !textures[i]) continue;
      gl.bindTexture(gl.TEXTURE_2D,textures[i]);
      gl.uniform1i(view,i);
      gl.uniform1f(opacity,pose.weight);
      gl.uniform2f(placement,pose.shift,pose.scale);
      const openJaw=i===0 && heat>.012;
      gl.uniform1f(breath,i===0?heat:0);
      gl.uniform1f(jaw,openJaw?0:-1);
      gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
      if(openJaw) {
        gl.uniform1f(jaw,1);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
      }
    }
  };
}
