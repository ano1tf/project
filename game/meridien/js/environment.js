import * as T from "three";
import { BOUNDS } from "./data.mjs";
import { clamp, expEase, lerp, rng, wrap } from "./core.mjs";

const vert = `varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
// A seamless packed noise print replaces hundreds of procedural shader operations per pixel.
function noisePrint() {
  const size = 192,
    r = rng(877346),
    octaves = [5, 11, 23, 48].map((n) => ({
      n,
      data: Float32Array.from({ length: n * n }, () => r()),
    }));
  const pixels = new Uint8Array(size * size * 4);
  function sample({ n, data }, u, v) {
    const x = u * n,
      y = v * n,
      a = x | 0,
      b = y | 0;
    const f = x - a,
      g = y - b,
      s = f * f * (3 - 2 * f),
      t = g * g * (3 - 2 * g),
      a2 = (a + 1) % n,
      b2 = (b + 1) % n;
    return lerp(
      lerp(data[b * n + a], data[b * n + a2], s),
      lerp(data[b2 * n + a], data[b2 * n + a2], s),
      t,
    );
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        u = x / size,
        v = y / size,
        a = sample(octaves[0], u, v),
        b = sample(octaves[1], u, v),
        c = sample(octaves[2], u, v),
        d = sample(octaves[3], u, v);
      pixels[i] = 255 * (a * 0.55 + b * 0.27 + c * 0.13 + d * 0.05);
      pixels[i + 1] = 255 * (a * 0.2 + b * 0.08 + c * 0.32 + d * 0.4);
      pixels[i + 2] = 255 * (a * 0.13 + b * 0.53 + c * 0.25 + d * 0.09);
      pixels[i + 3] = 255;
    }
  const t = new T.DataTexture(pixels, size, size);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
const output = `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;
const c = (n) => new T.Color(n);
const smooth = (v, a, b) => {
  const u = clamp((v - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const palette = {
  night: c(0x13223d),
  dusk: c(0x284263),
  day: c(0x427dad),
  horizonNight: c(0x344358),
  horizonDusk: c(0xbcb3a5),
  horizonDay: c(0xb3cbd2),
  warm: c(0xffac79),
  cloud: c(0x51677c),
  cityFog: c(0x596d77),
};
const skyFrag = `varying vec3 vWorld;
uniform sampler2D grain; uniform vec3 top,horizon,sunTint,sunDir,cloudColor;
uniform float t,power,overcast,night;
void main(){
 vec3 d=normalize(vWorld-cameraPosition);
 float u=max(0.,d.y), low=1.-u, band=low*low*low*low*low;
 vec3 col=mix(top,horizon,band*.98);
 float ribbon=smoothstep(.003,.075,u)*(1.-smoothstep(.085,.31,u));
 col=mix(col,col*.73+sunTint*.24,ribbon*power*(1.08-overcast*.35));
 float ds=max(dot(d,sunDir),0.);
 float glow=ds*ds;glow*=glow;float spot=glow*glow;
 col+=sunTint*power*(glow*.34+spot*.25+pow(ds,34.)*.31+smoothstep(.9996,.99992,ds)*1.17);
 vec2 uv=d.xz/(max(.05,u)+.14)*.175+vec2(t*.0022,-t*.00072);
 float f=texture2D(grain,uv).r;
 #ifndef ECO
   f = mix(f,texture2D(grain,uv*1.97+vec2(.3, f*.15)).b,.23);
   vec3 moon = normalize(vec3(.48,.54,-.8));
   float disk = max(dot(d,moon),0.);
   float litEdge = 1.-smoothstep(.99990,.99998,dot(d,normalize(moon+vec3(.012,.003,.006))));
   col += vec3(.56,.65,.78)*night*(pow(disk,86.)*.062+smoothstep(.99982,.99993,disk)*litEdge*.62)*(1.-overcast*.79);
 #endif
 float spread=smoothstep(.37-overcast*.14,.70-overcast*.10,f)*smoothstep(.0,.19,u);
 float rim=pow(ds,7.)*(1.-smoothstep(.43,.77,f));
 vec3 clouds=cloudColor*(.52+.71*smoothstep(.29,.64,f))+sunTint*power*(.24*rim+.10*glow);
 col=mix(col,clouds,spread*(.66+overcast*.28));
 col+=sunTint*power*glow*(1.-smoothstep(.015,.27,u))*.18;
 gl_FragColor=vec4(col,1.);${output}
}`;
const waterFrag = `varying vec3 vWorld; uniform sampler2D grain;
uniform vec3 horizon,top,sunTint,sunDir,fogCol; uniform float t,power,wet;
void main(){
 vec2 p=vWorld.xz; vec3 view=normalize(cameraPosition-vWorld);
 vec3 field=texture2D(grain,vec2(p.x*.021+t*.011,p.y*.087-t*.009)).rgb;
 float chop=field.g*.24+field.r*.76;
 float f=1.-abs(view.y); f*=f;
 vec3 col=mix(vec3(.015,.045,.054)*(1.+chop*.75),mix(top,horizon,.56),.17+f*.60);
 float glint=max(dot(vec3(-view.x,view.y,-view.z),sunDir),0.);glint*=glint;
 col+=sunTint*glint*glint*power*max(0.,chop-.24)*.74;
 float shore = 1.-smoothstep(2.7,18.,abs(p.x+187.5));
 col+=vec3(.033,.066,.065)*shore*smoothstep(.43,.71,chop);
 #ifndef ECO
   vec2 w=texture2D(grain,vec2(.153*p.x-t*.032,.061*p.y+t*.025)).rg;
   float mesh=sin(p.x*1.45+p.y*.7+w.g*5.1-t*1.0)*sin(p.y*.82+p.x*.31+w.r*3.+t*.65);
   vec3 reef=mix(top,horizon,.7);
   col+=reef*smoothstep(.37,.89,mesh+w.g*.27)*(.055+.21*f)*(.54+.46*wet);
   float tidal=smoothstep(.48,.68,w.r)*smoothstep(.12,.83,mesh)*shore;
   col+=vec3(.042,.082,.083)*tidal;
 #endif
 float streak=smoothstep(.31,.6,chop) * max(0., 1.-abs(p.y-18.+field.g*2.9)*.12);
 col+=vec3(.15,.076,.035)*streak*(1.-smoothstep(1.,19.,abs(p.x+198.)))*f;
 vec3 away=cameraPosition-vWorld;
 gl_FragColor=vec4(mix(fogCol,col,exp2(-dot(away,away)*.0000092)),1.);${output}
}`;
const puddleFrag = `varying vec3 vWorld;uniform sampler2D grain;
uniform vec3 horizon,top,sunTint; uniform float t,wet,power;
void main(){
 vec3 dir=normalize(cameraPosition-vWorld);float f=1.-abs(dir.y);f=f*f*f;
 vec2 poolNoise=texture2D(grain,vWorld.xz*.19+vec2(t*.0012,0.)).rg;
 float ripple=sin(vWorld.x*4.5-vWorld.z*5.+t*3.+poolNoise.g*12.);
 vec3 col=mix(top,horizon,clamp(f+.12+ripple*.037,0.,1.));
 col+=sunTint*power*max(0.,poolNoise.r-.3)*.11;
 gl_FragColor=vec4(col,wet*(.10+.43*f)*smoothstep(.29,.57,poolNoise.r));${output}
}`;
function mesh(geometry, material, x, y, z) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}
export class Climate {
  constructor(scene, world, progress, options) {
    this.scene = scene;
    this.world = world;
    this.wet = 0;
    this.roadWet = 0.37;
    this.mist = 0;
    this.pref = options.weather;
    this.count = 4;
    this.fog = new T.FogExp2(0xa2acac, 0.0028);
    scene.fog = this.fog;
    this.skyUniform = {
      grain: { value: noisePrint() },
      top: { value: c(0x50708b) },
      horizon: { value: c(0x9cacb0) },
      t: { value: 0 },
      sunTint: { value: palette.warm.clone() },
      sunDir: { value: new T.Vector3(-0.88, 0.18, 0.4).normalize() },
      power: { value: 0.8 },
      cloudColor: { value: palette.cloud.clone() },
      overcast: { value: 0.2 },
      night: { value: 0.1 },
    };
    this.sky = mesh(
      new T.SphereGeometry(2, 30, 16),
      new T.ShaderMaterial({
        uniforms: this.skyUniform,
        vertexShader: vert,
        fragmentShader: skyFrag,
        side: T.BackSide,
        depthWrite: false,
        fog: false,
      }),
      0,
      0,
      0,
    );
    this.sky.scale.setScalar(520);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 100;
    scene.add(this.sky);
    this.waterMat = new T.ShaderMaterial({
      uniforms: {
        ...this.skyUniform,
        fogCol: { value: this.fog.color },
        wet: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: waterFrag,
    });
    const west = mesh(
      new T.PlaneGeometry(1100, 1675),
      this.waterMat,
      -737,
      -1.87,
      -300,
    );
    const north = mesh(
      new T.PlaneGeometry(830, 1000),
      this.waterMat,
      228,
      -1.87,
      -674.5,
    );
    for (const water of [west, north]) {
      water.rotation.x = -Math.PI / 2;
      water.renderOrder = 8;
      scene.add(water);
    }
    this.hemi = new T.HemisphereLight(0xcde2ef, 0x6b6a63, 1.65);
    scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xffc989, 2.0);
    this.sun.castShadow = true;
    scene.add(this.sun, this.sun.target);
    const sh = this.sun.shadow;
    sh.mapSize.set(1280, 1280);
    sh.camera.left = sh.camera.bottom = -40;
    sh.camera.right = sh.camera.top = 40;
    sh.camera.near = 0.8;
    sh.camera.far = 210;
    sh.normalBias = 0.062;
    sh.bias = -0.00017;
    sh.radius = 2;
    sh.autoUpdate = false;
    this.lights = Array.from({ length: 3 }, () => {
      const l = new T.PointLight(0xffb982, 0, 17, 2);
      scene.add(l);
      return l;
    });
    this.puddles = this.makePuddles();
    this.glints = this.makeGlints();
    this.halos = this.makeHalos();
    this.headlamps = this.makeHeadlamps();
    this.rain = this.makeRain();
    this.makeMountains();
    this.nextWeather = 0;
    this.sampleWeather(progress.time, true);
    this.roadWet = this.current === "rain" ? 0.88 : 0.27;
  }
  setQuality(mode, shadows) {
    this.world.batch.setQuality(mode, shadows);
    this.shadows = shadows;
    this.sun.castShadow = shadows;
    const sh = this.sun.shadow,
      shadowSize = mode === "high" ? 1280 : 768;
    if (!shadows || sh.mapSize.x !== shadowSize) {
      sh.map?.dispose();
      sh.map = null;
    }
    sh.mapSize.set(shadowSize, shadowSize);
    sh.radius = mode === "high" ? 2.35 : 1.48;
    const eco = mode === "low";
    this.sky.scale.setScalar(eco ? 328 : 520);
    [this.sky.material, this.waterMat].forEach((m) => {
      m.defines = eco ? { ECO: 1 } : {};
      m.needsUpdate = true;
    });
    this.lights.forEach((l, i) => {
      if (i < (eco ? 1 : mode === "high" ? 3 : 2)) this.scene.add(l);
      else this.scene.remove(l);
    });
    this.count = eco ? 1 : mode === "high" ? 3 : 2;
    this.shadowStamp = -1;
    this.lightStamp = -1;
  }
  sampleWeather(minutes, instant = false) {
    const phase = wrap(minutes, 1440);
    const auto =
      phase < 455 || phase > 1340
        ? "fog"
        : (phase > 1217 && phase < 1292) || (phase > 645 && phase < 722)
          ? "rain"
          : "clear";
    this.current = this.pref === "auto" ? auto : this.pref;
    if (instant) {
      this.wet = this.current === "rain" ? 1 : 0;
      this.mist = this.current === "fog" ? 1 : 0;
    }
  }
  setWeather(key) {
    this.pref = key;
    this.nextWeather = 0;
  }
  makePuddles() {
    const rand = rng(1317),
      verts = [];
    const pools = [
      [-156.5, 97.4, 4.2, 1.6],
      [-158.6, 112, 2.1, 3.1],
      [-139, 101.6, 4.3, 1.5],
      [-157.9, 78.0, 1.9, 4.6],
    ];
    for (let i = 0; i < 64; i++) {
      const vertical = i % 2,
        x = vertical
          ? [-154, -86, -12, 64, 136][i % 5] + (rand() - 0.5) * 11
          : BOUNDS.minX + 20 + rand() * 329,
        z = vertical
          ? BOUNDS.minZ + 13 + rand() * 305
          : [-142, -78, -10, 58, 126][i % 5] + (rand() - 0.5) * 10;
      pools.push([x, z, 1.1 + rand() * 3.81, 1.3 + rand() * 3.2]);
    }
    for (const [x, z, w, d] of pools) {
      const rim = [];
      for (let i = 0; i < 16; i++) {
        const t = (i * Math.PI) / 8,
          f = 0.78 + rand() * 0.27;
        rim.push([
          x + Math.cos(t) * w * 0.5 * f,
          z + Math.sin(t) * d * 0.5 * f,
        ]);
      }
      for (let i = 0; i < rim.length; i++) {
        const v = rim[i],
          b = rim[(i + 1) % rim.length];
        verts.push(x, 0.009, z, b[0], 0.009, b[1], v[0], 0.009, v[1]);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
    const mat = new T.ShaderMaterial({
      uniforms: { ...this.skyUniform, wet: { value: 0.09 } },
      vertexShader: vert,
      fragmentShader: puddleFrag,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const m = new T.Mesh(g, mat);
    m.renderOrder = 4;
    this.scene.add(m);
    return m;
  }
  makeGlints() {
    const positions = [],
      uv = [],
      colors = [];
    for (const l of this.world.lamps) {
      if (l.y < 2.0 || l.power < 36) continue;
      const c = new T.Color(l.rgb),
        sx = l.y * 0.77 + 1.8,
        sz = l.y * 1.48 + 1.9,
        z = l.z,
        x = l.x;
      for (const [u, v] of [
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ]) {
        positions.push(x + (u - 0.5) * sx, 0.101, z + (v - 0.5) * sz);
        uv.push(2 * u - 1, 2 * v - 1);
        colors.push(c.r, c.g, c.b);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setAttribute("tint", new T.Float32BufferAttribute(colors, 3));
    const m = new T.ShaderMaterial({
      uniforms: { strength: { value: 0.35 }, wet: { value: 0.1 } },
      vertexShader: `attribute vec3 tint;varying vec3 vWorld,vTint;varying vec2 st;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vTint=tint;st=uv;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `varying vec3 vWorld,vTint;varying vec2 st;uniform float strength,wet;
    void main(){float r=length(st),fall=pow(max(0.,1.-r),2.6),dist=length(cameraPosition-vWorld);
      float strips=.75+.25*cos(vWorld.x*7.+cos(vWorld.z*18.)*.35);
      float w=wet*(.22+.55*strips)+.15;
      gl_FragColor=vec4(vTint,fall*w*strength*max(0.,1.-dist*.010));${output}
    }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const o = new T.Mesh(g, m);
    o.renderOrder = 6;
    this.scene.add(o);
    return o;
  }
  makeHalos() {
    const pos = [],
      color = [],
      exposure = [];
    for (const l of this.world.lamps) {
      if (l.power < 35) continue;
      pos.push(l.x, l.y + 0.09, l.z);
      const tint = new T.Color(l.rgb);
      color.push(tint.r, tint.g, tint.b);
      exposure.push(l.power > 67 ? 1 : 0.74);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("tint", new T.Float32BufferAttribute(color, 3));
    g.setAttribute("exposure", new T.Float32BufferAttribute(exposure, 1));
    const m = new T.ShaderMaterial({
      uniforms: { height: { value: 540 }, night: { value: 0.7 } },
      vertexShader: `attribute vec3 tint;attribute float exposure;uniform float height;varying vec3 ink;varying float weight;
        void main(){vec4 v=modelViewMatrix*vec4(position,1.);float z=max(-v.z,.1); gl_PointSize=clamp(height*exposure*.77/z,1.,61.);
        weight=1.-smoothstep(61.,158.,z);ink=tint;gl_Position=projectionMatrix*v;}`,
      fragmentShader: `varying vec3 ink;varying float weight;uniform float night;
        void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p),a=max(0.,1.-d);gl_FragColor=vec4(ink,a*a*a*(.20-.14*d)*night*weight);${output}}`,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const o = new T.Points(g, m);
    o.renderOrder = 7;
    this.scene.add(o);
    return o;
  }
  setResolution(height) {
    this.halos.material.uniforms.height.value = height;
  }
  makeHeadlamps() {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [-4.0, 0, -15, 4.0, 0, -15, 1.3, 0, 0, -1.3, 0, 0],
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2),
    );
    geometry.setIndex([0, 3, 1, 3, 2, 1]);
    const material = new T.ShaderMaterial({
      uniforms: { amount: { value: 0 } },
      vertexShader:
        "varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec2 st;uniform float amount;
        void main(){float x=abs(st.x*2.-1.);float f=(1.-smoothstep(.2,.94,x))*smoothstep(.0,.14,st.y)*(1.-smoothstep(.16,1.,st.y));
        gl_FragColor=vec4(.94,.63,.35,amount*f*f);${output}}`,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const cone = mesh(geometry, material, 0, 0.027, 0);
    cone.visible = false;
    cone.renderOrder = 7;
    this.scene.add(cone);
    return cone;
  }
  makeRain() {
    const n = 460,
      r = rng(407170),
      drop = [],
      g = new T.BufferGeometry();
    for (let i = 0; i < n; i++)
      drop.push({
        x: (r() - 0.5) * 42,
        y: r() * 19,
        z: (r() - 0.5) * 42,
        v: 10 + r() * 11,
      });
    const a = new T.BufferAttribute(new Float32Array(n * 6), 3);
    a.setUsage(T.DynamicDrawUsage);
    g.setAttribute("position", a);
    const mat = new T.LineBasicMaterial({
      color: 0xb0cada,
      opacity: 0,
      transparent: true,
      depthWrite: false,
    });
    const lines = new T.LineSegments(g, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 8;
    this.scene.add(lines);
    return { drop, a, lines };
  }
  makeMountains() {
    const rr = rng(132),
      bands = [
        [-730, 67, 62, 0x577581],
        [-537, 39, 48, 0x536d77],
        [-449, 24, 30, 0x4b656f],
      ];
    for (let k = 0; k < bands.length; k++) {
      const [z, b, h, col] = bands[k],
        points = [],
        pos = [];
      for (let i = 0; i < 67; i++) {
        const x = -1050 + i * 32;
        const a = (Math.sin(i * 0.196 - k * 0.72) + 1) * 0.5,
          d = (Math.sin(i * 0.473 + k * 1.6) + 1) * 0.5;
        points.push([
          x,
          b * 0.31 + h * (a * 0.63 + d * 0.32 + rr() * 0.21),
          z + Math.sin(i * 0.49 + k) * 19,
        ]);
      }
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i],
          b = points[i + 1];
        pos.push(
          a[0],
          -6,
          a[2],
          b[0],
          -6,
          b[2],
          ...a,
          ...a,
          b[0],
          -6,
          b[2],
          ...b,
        );
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      const ma = new T.MeshBasicMaterial({ color: col, side: T.DoubleSide });
      this.scene.add(new T.Mesh(g, ma));
    }
  }
  updateConditions(dt, elapsed, minutes) {
    if (elapsed >= this.nextWeather) {
      this.sampleWeather(minutes);
      this.nextWeather = elapsed + 0.5;
    }
    this.wet = lerp(
      this.wet,
      this.current === "rain" ? 1 : 0,
      expEase(0.4, dt),
    );
    this.mist = lerp(
      this.mist,
      this.current === "fog" ? 1 : 0,
      expEase(0.34, dt),
    );
    this.roadWet = lerp(
      this.roadWet,
      this.wet,
      expEase(this.wet > this.roadWet ? 0.22 : 0.012, dt),
    );
  }
  update(
    dt,
    elapsed,
    minutes,
    p,
    camera,
    quality,
    stage,
    visualTime = elapsed,
  ) {
    const hour = minutes / 60,
      sunArc = Math.sin(((hour - 5.7) / 14.8) * Math.PI),
      day = smooth(sunArc, -0.25, 0.64),
      twilight = smooth(sunArc, -0.3, 0.08) * (1 - smooth(sunArc, 0.21, 0.68));
    const clear = 1 - this.wet * 0.5 - this.mist * 0.54,
      over = clamp(0.16 + Math.max(this.wet, this.mist) * 0.89, 0, 1);
    const u = this.skyUniform;
    this.scene.environmentIntensity = 0.19 + 0.22 * day + 0.045 * twilight;
    u.top.value
      .copy(palette.night)
      .lerp(palette.dusk, smooth(sunArc, -0.32, 0.13))
      .lerp(palette.day, smooth(sunArc, 0.17, 0.83));
    u.horizon.value
      .copy(palette.horizonNight)
      .lerp(palette.horizonDusk, smooth(sunArc, -0.28, 0.08))
      .lerp(palette.horizonDay, smooth(sunArc, 0.2, 0.83));
    u.top.value.lerp(palette.cloud, 0.21 * over);
    u.cloudColor.value
      .copy(u.top.value)
      .lerp(u.horizon.value, 0.45)
      .multiplyScalar(0.49 + day * 0.24);
    u.sunTint.value.copy(palette.warm).lerp(palette.horizonDay, day * 0.67);
    u.power.value = (0.38 * day + 0.52 * twilight) * clear;
    u.night.value = 1 - smooth(sunArc, -0.33, -0.08);
    const az = ((hour - 12.65) / 14.8) * Math.PI;
    u.sunDir.value
      .set(-Math.sin(az), Math.max(-0.24, sunArc * 0.83), -0.43)
      .normalize();
    u.overcast.value = over;
    u.t.value = visualTime;
    this.sky.position.copy(camera.position);
    this.fog.color
      .copy(u.horizon.value)
      .lerp(palette.cityFog, over * 0.24)
      .multiplyScalar(0.75 + day * 0.13);
    this.fog.density =
      (quality === "low" ? 0.00215 : 0.00168) +
      this.wet * 0.00138 +
      this.mist * 0.0068;
    const shelter = this.world.isRoofed(p);
    this.hemi.intensity =
      (0.84 + day * 1.04 + twilight * 0.26) * (shelter ? 0.77 : 1);
    this.hemi.color
      .setHex(0xcde2ef)
      .lerp(u.horizon.value, 0.15 + twilight * 0.22);
    this.hemi.groundColor.setHex(0x747364);
    this.sun.color
      .copy(u.sunTint.value)
      .lerp(palette.horizonDay, (1 - day) * 0.29);
    this.sun.intensity = (0.18 + 2.22 * day + 0.62 * twilight) * clear;
    // Use a local shadow cache rather than drawing the city again each frame.
    const stamp = Math.floor(elapsed * (quality === "high" ? 8 : 5));
    const sh = this.sun.shadow;
    sh.intensity =
      smooth(u.sunDir.value.y, 0.05, 0.33) * (0.95 - this.mist * 0.43);
    if (stamp !== this.shadowStamp) {
      this.shadowStamp = stamp;
      const a = quality === "high" ? 40 : 34,
        texel = (a * 2) / sh.mapSize.x,
        dx = Math.round(p.x / texel) * texel,
        dz = Math.round(p.z / texel) * texel;
      sh.camera.left = sh.camera.bottom = -a;
      sh.camera.right = sh.camera.top = a;
      sh.camera.updateProjectionMatrix();
      this.sun.position.set(
        dx + u.sunDir.value.x * 95,
        Math.max(0.11, u.sunDir.value.y) * 95,
        dz + u.sunDir.value.z * 95,
      );
      this.sun.target.position.set(dx, 0, dz);
      if (this.shadows && (sh.intensity > 0.01 || !sh.map))
        sh.needsUpdate = true;
    }
    const power = 1 - smooth(sunArc, 0.14, 0.55) * 0.87;
    this.world.batch.lighting(this, camera.position, { day, twilight, power });
    const car = p.car,
      cone = this.headlamps;
    cone.visible = !!car && power > 0.35;
    if (cone.visible) {
      const nose = car.spec.length * 0.53;
      cone.position.set(
        car.x + Math.sin(car.heading) * nose,
        0.029,
        car.z - Math.cos(car.heading) * nose,
      );
      cone.rotation.y = -car.heading;
      cone.material.uniforms.amount.value =
        power * (0.072 + this.roadWet * 0.1);
    }
    this.halos.material.uniforms.night.value = power * (0.72 + 0.45 * this.wet);
    this.glints.material.uniforms.strength.value = power * 1.26;
    this.glints.material.uniforms.wet.value = 0.4 + this.roadWet * 0.61;
    this.puddles.material.uniforms.wet.value = 0.06 + this.roadWet * 0.8;
    this.puddles.visible = this.roadWet > 0.2;
    if (Math.floor(elapsed * 5) !== this.lightStamp) {
      this.lightStamp = Math.floor(elapsed * 5);
      this.lampsNear = this.world.lamps
        .map((l) => [l, (l.x - p.x) ** 2 + (l.z - p.z) ** 2])
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.count);
    }
    this.lights.forEach((l, i) => {
      const film = i === 0 ? stage?.light : i === 1 ? stage?.lightTwo : null;
      if (film) {
        l.position.set(film.x, film.y, film.z);
        l.color.setHex(film.color);
        l.distance = 8.4;
        l.intensity = film.power;
        return;
      }
      const item = this.lampsNear?.[i];
      if (!item || (i > 1 && quality === "low")) {
        l.intensity = 0;
        return;
      }
      const a = item[0];
      l.position.set(a.x, a.y, a.z);
      l.color.setHex(a.rgb);
      l.distance = a.span;
      const inside = shelter && this.world.isRoofed(a);
      l.intensity =
        a.power * Math.max(power, inside ? 0.77 : 0) * (1 + this.wet * 0.05);
    });
    const rain = this.rain;
    rain.lines.visible =
      this.wet > 0.16 &&
      (!stage || stage.hero.z < 70) &&
      !this.world.isRoofed(camera.position);
    rain.lines.material.opacity = 0.35 * this.wet;
    if (rain.lines.visible) {
      const n = quality === "low" ? 188 : rain.drop.length;
      rain.a.clearUpdateRanges();
      rain.a.addUpdateRange(0, n * 6);
      rain.lines.geometry.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) {
        const d = rain.drop[i];
        d.y -= dt * d.v;
        d.x += dt * 2.1;
        if (d.y < 0) {
          d.y += 19;
          d.x = ((d.x * 3.279 + 27.71) % 42) - 21;
        }
        if (d.x > 21) d.x -= 42;
        const x = camera.position.x + d.x,
          y = d.y - 0.4,
          z = camera.position.z + d.z;
        rain.a.setXYZ(i * 2, x, y, z);
        rain.a.setXYZ(
          i * 2 + 1,
          x - 0.07,
          y + 0.45 + (i % 4) * 0.09,
          z + 0.035,
        );
      }
      rain.a.needsUpdate = true;
    }
  }
}
