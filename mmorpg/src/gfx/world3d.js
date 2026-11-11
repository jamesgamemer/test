import { THREE, U } from './common.js';
import { buildTextures } from './textures.js';
import { bakeWorldMaps, createTerrain } from './terrain.js';
import { createGrass } from './grass.js';
import { createVegetation } from './vegetation.js';
import { createRuins } from './ruins.js';
import { createOutpost } from './outpost.js';
import { LightPool, createFires, createFireflies, createMist, createGodRays, MOON_DIR } from './ambient.js';
import { PostFX } from './post.js';
import { loadEnv } from './assets.js';
import { buildLayout, heightGrid, heightAt } from '../shared/world.js';

export const QUALITY = {
  low: { grass: 8000, undergrowth: 0.4, msaa: 0, dof: false, shadow: 1024, pixelRatio: 1, fireflies: 110, mist: 20, rays: 36, lights: 5, bloom: 5, torchShadow: 0, ao: 0 },
  medium: { grass: 18000, undergrowth: 0.7, msaa: 2, dof: false, shadow: 2048, pixelRatio: 1.25, fireflies: 200, mist: 34, rays: 60, lights: 7, bloom: 6, torchShadow: 0, ao: 8 },
  high: { grass: 38000, undergrowth: 1, msaa: 4, dof: true, shadow: 2048, pixelRatio: 1.5, fireflies: 300, mist: 46, rays: 80, lights: 8, bloom: 6, torchShadow: 1024, ao: 12 },
  ultra: { grass: 62000, undergrowth: 1.25, msaa: 4, dof: true, shadow: 4096, pixelRatio: 2, fireflies: 420, mist: 56, rays: 90, lights: 9, bloom: 7, torchShadow: 2048, ao: 16 },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

export class World3D {
  constructor(canvas, qualityName = 'high') {
    this.canvas = canvas;
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName] || QUALITY.high;
    // multisampled float targets are unreliable on some phone GPUs; phones render without MSAA
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (this.coarse) this.q = { ...this.q, msaa: 0 };
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x04080f, 1);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08142f, 0.0125);
    this.scene.background = new THREE.Color(0x04080f);
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 280);
    this.focus = new THREE.Vector3();
    this.time = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._right = new THREE.Vector3().crossVectors(MOON_DIR, new THREE.Vector3(0, 1, 0)).normalize();
    this._up = new THREE.Vector3().crossVectors(this._right, MOON_DIR).normalize();
  }

  async build(progress = () => {}) {
    const q = this.q, scene = this.scene;
    progress(0.05, 'textures'); await tick();
    const T = this.tex = buildTextures();
    U.uNoiseTex.value = T.noise;
    // generated art: prop models, ground textures and foliage cards replace the code-drawn ones
    const A = this.assets = await loadEnv((k) => progress(0.05 + k * 0.13, 'textures'));
    T.dirt = A.ground.ground_mud.map; T.groundN = A.ground.ground_mud.normalMap;
    T.moss = A.ground.ground_forest.map; T.mossN = A.ground.ground_forest.normalMap;
    T.stone = A.ground.stone.map; T.stoneN = A.ground.stone.normalMap;
    T.bark = A.ground.bark.map; T.barkN = A.ground.bark.normalMap;
    T.leaf = A.cards.leaves.map;
    T.hero = A.hero || null; // actors are built from the texture set, so the rigged hero rides along with it
    progress(0.2, 'terrain'); await tick();
    const layout = this.layout = buildLayout();
    heightGrid();
    await tick();
    const maps = this.maps = bakeWorldMaps(layout);
    U.uWorldTex.value = maps.tex;
    progress(0.42, 'terrain'); await tick();
    this.terrain = createTerrain(T);
    scene.add(this.terrain.group);
    progress(0.5, 'forest'); await tick();
    const veg = createVegetation(layout, maps, T, q, A);
    scene.add(veg.group);
    progress(0.7, 'ruins'); await tick();
    const ruins = createRuins(T, A);
    scene.add(ruins.group);
    const outpost = createOutpost(T, A);
    scene.add(outpost.group);
    const fires = [...ruins.fires, ...outpost.fires];
    progress(0.8, 'grass'); await tick();
    scene.add(createGrass(q.grass, A.cards.grass));
    progress(0.88, 'lights'); await tick();

    // --- lighting
    this.hemi = new THREE.HemisphereLight(0x5a84d8, 0x1a2c38, 3.4);
    scene.add(this.hemi);
    const moon = this.moon = new THREE.DirectionalLight(0xa3beff, 3.4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(q.shadow, q.shadow);
    const S = 48;
    Object.assign(moon.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 190 });
    moon.shadow.camera.updateProjectionMatrix();
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.07;
    moon.shadow.radius = 2.2;
    this._texel = (S * 2) / q.shadow;
    scene.add(moon, moon.target);

    this.pool = new LightPool(scene, q.lights);
    this.pool.setSources([
      ...fires.map((f) => ({ ...f, flicker: 0.16, priority: 500 })),
      ...ruins.lamps.map((l) => ({ ...l, priority: 200 })),
      ...veg.glowLights,
    ]);
    // The camp's first wall torch also throws real shadows across the court (one extra shadow pass):
    // a wide spot aimed out from the wall and down, on top of the pooled glow every fire has.
    this.torches = q.torchShadow ? fires.filter((f) => f.kind === 'torch') : [];
    if (this.torches.length) {
      const spot = this.torchSpot = new THREE.SpotLight(0xff8a3a, 0, 26, 1.2, 0.75, 1.5);
      this.torchNow = null; this.torchFade = 0;
      spot.castShadow = true;
      spot.shadow.mapSize.set(q.torchShadow, q.torchShadow);
      spot.shadow.camera.near = 0.4; spot.shadow.camera.far = 26;
      spot.shadow.bias = -0.006; spot.shadow.normalBias = 0.12;
      scene.add(spot, spot.target);
    }
    this.heroLight = new THREE.PointLight(0x86bdff, 8, 10, 1.3);
    scene.add(this.heroLight);
    this.fxLights = [new THREE.PointLight(0xffffff, 0, 14, 1.6), new THREE.PointLight(0xffffff, 0, 14, 1.6)];
    scene.add(...this.fxLights);

    scene.add(createFires(fires));
    scene.add(createFireflies(q.fireflies));
    scene.add(createMist(q.mist, T.soft));
    scene.add(createGodRays(maps, q.rays, T.soft));

    this.post = new PostFX(this.renderer, { msaa: q.msaa, dof: q.dof, bloomLevels: q.bloom, ao: this.coarse ? 0 : q.ao });
    this.resize();
    progress(1, 'ready'); await tick();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * (this.resScale || 1);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.floor(w * pr), Math.floor(h * pr), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.viewW = w; this.viewH = h;
  }

  // hero: world position of the player (THREE.Vector3). pushers: [{x, z, r, k}] bending the grass.
  update(dt, hero, pushers = []) {
    this.time += dt;
    U.uTime.value = this.time;
    const cam = this.camera;
    cam.updateMatrixWorld();
    // grass / particle window sits ahead of the hero along the view direction
    cam.getWorldDirection(this._v);
    this._v.y = 0; this._v.normalize();
    U.uFocus.value.set(hero.x + this._v.x * 13, hero.y, hero.z + this._v.z * 13);
    for (let i = 0; i < 8; i++) {
      const p = pushers[i], u = U.uPush.value[i];
      if (p) u.set(p.x, p.z, p.r, p.k); else u.set(0, 0, 1, 0);
    }
    // see-through fade around the hero
    this._v2.set(hero.x, hero.y + 1.0, hero.z).applyMatrix4(cam.matrixWorldInverse);
    U.uFadeDepth.value = -this._v2.z;
    U.uFadeY.value = hero.y;
    this._v2.applyMatrix4(cam.projectionMatrix);
    U.uFadeCenter.value.set(this._v2.x, this._v2.y);
    this.focusDist = U.uFadeDepth.value;

    // shadow frustum follows the hero, snapped to shadow texels to keep edges stable
    const t = this._texel;
    const a = hero.x * this._right.x + hero.y * this._right.y + hero.z * this._right.z;
    const b = hero.x * this._up.x + hero.y * this._up.y + hero.z * this._up.z;
    const da = Math.round(a / t) * t - a, db = Math.round(b / t) * t - b;
    const tx = hero.x + this._right.x * da + this._up.x * db + this._v.x * 8;
    const ty = hero.y + this._right.y * da + this._up.y * db;
    const tz = hero.z + this._right.z * da + this._up.z * db + this._v.z * 8;
    this.moon.target.position.set(tx, ty, tz);
    this.moon.position.set(tx - MOON_DIR.x * 95, ty - MOON_DIR.y * 95, tz - MOON_DIR.z * 95);

    this.pool.update(hero, this.time);
    if (this.torchSpot) {
      // one torch at a time throws real shadows: whichever is nearest the hero. It fades out, moves, fades in.
      let best = null, bd = 1e9;
      for (const f of this.torches) { const d = (f.x - hero.x) ** 2 + (f.z - hero.z) ** 2; if (d < bd) { bd = d; best = f; } }
      const spot = this.torchSpot, want = bd < 34 * 34 ? best : null;
      if (want !== this.torchNow) { this.torchFade -= dt * 3.5; if (this.torchFade <= 0) { this.torchFade = 0; this.torchNow = want; if (want) this._aimTorch(want); } }
      else this.torchFade = Math.min(1, this.torchFade + dt * 3.5);
      const t = this.time, base = this.torchNow && this.torchNow.post ? 85 : 150;
      spot.intensity = this.torchNow ? base * this.torchFade * (1 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.7)) : 0;
    }
    this.heroLight.position.set(hero.x, hero.y + 2.5, hero.z);
    this.terrain.update(this.time);
  }

  render() {
    this.post.render(this.scene, this.camera, this.focusDist || 25);
  }

  // a wall torch lights out from its wall and down; a torch on a post or a tree lights the ground all round it
  _aimTorch(f) {
    const spot = this.torchSpot;
    spot.position.set(f.x, f.y + 0.15, f.z);
    if (f.post) { spot.angle = 1.32; spot.target.position.set(f.x + 0.01, f.y - 4, f.z); }
    else { spot.angle = 1.2; spot.target.position.set(f.x + Math.sin(f.face) * 5, f.y - 4.2, f.z + Math.cos(f.face) * 5); }
    spot.target.updateMatrixWorld();
  }

  heightAt(x, z) { return heightAt(x, z); }
}
