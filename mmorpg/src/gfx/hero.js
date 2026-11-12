// The hero: a generated, rigged character (assets/env/hero.skin, hero.anim; packed by dev/build_char.py).
// Its design, its model, its skeleton and every move are generated, and no bone is ever posed by code here:
// this file only plays the motion clips back (see motion.js for the clips and the animator's edits to them),
// blending one into the next, and lets what the rig has no bones for - cloth, hair, the rise of the chest
// with each breath - follow the body.
import { THREE } from './common.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

// .skin: 'NGS1', header length, JSON header, then quantised vertex blocks and the inverse bind matrices
export function parseSkin(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x3153474e) throw new Error('not a skin file');
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))), off = 8 + hl;
  const n = head.verts, B = head.blocks;
  const qp = new Uint16Array(buf, off + B.pos[0], n * 3), qn = new Int8Array(buf, off + B.nrm[0], n * 4), qt = new Uint16Array(buf, off + B.uv[0], n * 2);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) { pos[i * 3 + k] = head.min[k] + (qp[i * 3 + k] / 65535) * head.size[k]; nrm[i * 3 + k] = qn[i * 4 + k] / 127; }
    uv[i * 2] = head.uvMin[0] + (qt[i * 2] / 65535) * head.uvSize[0];
    uv[i * 2 + 1] = head.uvMin[1] + (qt[i * 2 + 1] / 65535) * head.uvSize[1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf, off + B.joints[0], n * 4).slice(), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf, off + B.weights[0], n * 4).slice(), 4, true));
  // what the skeleton cannot move: x how freely the vertex hangs (cloth, hair), y how much it rises with a breath,
  // z whether it hangs from the upper body or from the hips; w how much it is skin of the face (lit as a ball)
  g.setAttribute('aSoft', new THREE.BufferAttribute(new Uint8Array(buf, off + B.soft[0], n * 4).slice(), 4, true));
  g.setIndex(new THREE.BufferAttribute((head.wide ? new Uint32Array(buf, off + B.idx[0], head.tris * 3) : new Uint16Array(buf, off + B.idx[0], head.tris * 3)).slice(), 1));
  g.computeTangents(); // for the detail (normal) map: the same frames dev/make_lowpoly.py baked it in
  const ibm = new Float32Array(buf, off + B.ibm[0], head.bones.length * 16).slice();
  return { geo: g, bones: head.bones, ibm, scale: head.scale, lift: head.lift, height: head.height, named: head.named };
}

// The hero is small on screen and coarse up close: its own facets would shade themselves. Looking up a shadow
// a few centimetres off the surface leaves only shadows cast by other things.
const SHADOW_LIFT = THREE.ShaderChunk.shadowmap_vertex.replace(/(\w+LightShadows\[ i \]\.shadowNormalBias)/g, '( $1 + 0.04 )');

// Cloth and hair have no bones of their own. Each loose vertex is pushed by two springs that trail the part of
// the body it hangs from (a quick one near the seam, a slow one at the hem), by that part's turning, and by a
// little wind. The chest also swells with each breath.
const SOFT_DECL = 'attribute vec4 aSoft; uniform vec3 uSway[4]; uniform vec2 uTurn; uniform float uTime; uniform float uPhase; uniform float uBreath;\n';
const SOFT_MOVE = `#include <skinning_vertex>
        {
          transformed += objectNormal * (aSoft.y * uBreath * (0.55 + 0.45 * objectNormal.z));
          float cw = aSoft.x * aSoft.x;
          vec3 sway = mix(mix(uSway[2], uSway[3], aSoft.x), mix(uSway[0], uSway[1], aSoft.x), aSoft.z);
          // turning swings the hem round the body's axis
          sway += vec3(-transformed.z, 0.0, transformed.x) * mix(uTurn.y, uTurn.x, aSoft.z);
          float fl = sin(uTime * 2.3 + uPhase + transformed.y * 9.0 + transformed.x * 5.0) + 0.6 * sin(uTime * 3.7 + uPhase * 1.7 + transformed.z * 11.0);
          sway += vec3(fl * 0.012, 0.0, fl * 0.02 + 0.006);
          // cloth cannot swing into the body it lies against
          float into = dot(normalize(objectNormal.xz + 1e-5), normalize(sway.xz + 1e-5));
          sway.xz *= mix(0.3, 1.0, smoothstep(-0.7, 0.2, into));
          sway *= cw;
          transformed += sway;
          // swung out sideways it also lifts a little
          transformed.y += dot(sway.xz, sway.xz) * 0.9;
        }`;
// Drawn, not photographed: a lamp lights the side that faces it evenly and leaves the rest to the ambient
// light, with a soft edge between the two - the two-tone shading of an animated film - instead of fading
// smoothly across every bump.
const TOON_LIGHT = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  'float rawNL = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = smoothstep( uToon.x, uToon.y, rawNL ) * mix( uToon.z, 1.0, saturate( rawNL ) ) * 0.7;');
// the sculpt's fine detail, turned down on the skin of the face (its features are painted; see soften_face in dev/build_char.py)
const DETAIL = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * ( 1.0 - 0.8 * vFace );');

function bodyPatch(mat, uniforms) {
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = SOFT_DECL + 'varying float vFace;\n' + s.vertexShader
      .replace('#include <skinning_vertex>', SOFT_MOVE + '\n        vFace = aSoft.w;')
      .replace('#include <shadowmap_vertex>', SHADOW_LIFT);
    // A dark figure in a dark wood: it keeps a little of its own colour whatever the light, and the moon
    // catches its outline.
    s.fragmentShader = 'uniform vec3 uRim; uniform float uFill; uniform vec4 uDye; uniform vec3 uToon; varying float vFace;\n' + s.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', TOON_LIGHT)
      .replace('#include <normal_fragment_maps>', DETAIL)
      // the hood and waist cloth are painted indigo; another look dyes just that cloth, keeping its light and shade
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float violet = smoothstep(0.28, 0.5, (mx - mn) / (mx + 1e-4)) * smoothstep(0.0, 0.04, diffuseColor.b - max(diffuseColor.r, diffuseColor.g));
          diffuseColor.rgb = mix(diffuseColor.rgb, uDye.rgb * mx, violet * uDye.a);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uFill;
        totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.5) * (0.5 + 0.5 * dot(diffuseColor.rgb, vec3(0.6)));`)
      // Skin is the palest thing in the wood: beside a fire it would burn out to a white glow. Past a point the
      // figure's brightness is eased off, so a face keeps its features in any light.
      .replace('#include <opaque_fragment>', `{
          float top = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
          if (top > 0.55) outgoingLight *= (0.55 + (top - 0.55) / (1.0 + (top - 0.55) * 2.2)) / top;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hero-body';
  return mat;
}

// The ink line round the figure: the same body drawn again inside out, a little larger, in a dark colour.
// It grows along the normals by a share of its distance from the eye, so the line keeps its width on screen
// however far the camera stands; it is thinner round the face.
function outlineMaterial(uniforms) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x08060d, side: THREE.BackSide });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = SOFT_DECL + 'uniform float uOutline;\n' + s.vertexShader
      .replace('#include <skinning_vertex>', SOFT_MOVE)
      .replace('#include <project_vertex>', `#include <project_vertex>
        mvPosition.xyz += normalize(transformedNormal) * (uOutline * -mvPosition.z * (1.0 - 0.55 * aSoft.w));
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'hero-outline';
  return mat;
}

// The sword's painting glows orange along the edge and the runes; other blade colours repaint just that glow.
// uShow draws it only so far from the pommel toward the point: it appears in the hand, and on the back, as a
// blade of light running out from the hilt.
function swordMaterial(model, look, glowFrom) {
  const u = { uGlow: { value: new THREE.Color(look.blade) }, uHot: { value: 0 }, uRepaint: { value: look.ramp ? 1 : 0 }, uGlowFrom: { value: glowFrom }, uShow: { value: 1 } };
  const mat = new THREE.MeshStandardMaterial({ map: model.map, normalMap: model.normalMap || null, roughness: 0.42, metalness: 0.55, alphaTest: model.alpha ? 0.5 : 0 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <shadowmap_vertex>', SHADOW_LIFT);
    s.fragmentShader = 'uniform vec3 uGlow; uniform float uHot; uniform float uRepaint; uniform float uGlowFrom; uniform float uShow;\n' + s.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float reach = uShow * 1.12 - vMapUv.y;
        if (reach < 0.0) discard;
        float lit = (1.0 - smoothstep(0.0, 0.1, reach)) * step(uShow, 0.995);
        float gMask = smoothstep(0.12, 0.5, diffuseColor.r - diffuseColor.b) * smoothstep(0.25, 0.7, diffuseColor.r) * step(uGlowFrom, vMapUv.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlow * dot(diffuseColor.rgb, vec3(0.4, 0.4, 0.2)) * 1.6, gMask * uRepaint);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(diffuseColor.rgb, uGlow, uRepaint) * gMask * (1.1 + uHot * 2.4) + uGlow * lit * 5.0;`);
  };
  mat.customProgramCacheKey = () => 'hero-sword';
  mat.userData.u = u;
  return mat;
}

export class HeroActor {
  // H: the loaded hero ({ geo, bones, ibm, scale, lift, clips, map, sword }); look: one of LOOKS
  constructor(H, look, { npc = null } = {}) {
    this.H = H; this.look = look; this.npc = npc;
    this.group = new THREE.Group();
    const inner = this.inner = new THREE.Group();
    this.group.add(inner);
    const rig = this.rig = new THREE.Group();
    rig.scale.setScalar(H.scale); rig.position.y = H.lift;
    inner.add(rig);
    this.height = H.height + 0.35; this.radius = 0.4;
    this.action = null; this.actionT = 0; this.actionDur = 1; this.actionArg = 0;
    this.dead = false; this.deadT = 0; this.wDead = 0; this.freezeT = 0;
    this.time = Math.random() * 10; this.bladeHot = 0; this.effort = 0;

    // skeleton
    const bones = this.bones = H.bones.map((b) => { const o = new THREE.Bone(); o.name = b.id; o.position.fromArray(b.t); o.quaternion.fromArray(b.r); o.scale.fromArray(b.s); return o; });
    H.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); else rig.add(bones[i]); });
    const inverses = H.bones.map((b, i) => new THREE.Matrix4().fromArray(H.ibm, i * 16));
    const skeleton = this.skeleton = new THREE.Skeleton(bones, inverses);
    this.soft = { uSway: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) }, uTurn: { value: new THREE.Vector2() }, uTime: { value: 0 }, uPhase: { value: Math.random() * 6.28 }, uBreath: { value: 0 }, uRim: { value: new THREE.Color(0x9cc4ff).multiplyScalar(0.22) }, uFill: { value: 0.14 },
      uToon: { value: new THREE.Vector3(0.02, 0.3, 0.74) }, uOutline: { value: 0.0016 } };
    // the cloth takes the colour of the look (or of the villager's trade); the painting's own indigo, with its orange lantern and blade, is the 'ember' look
    const dye = new THREE.Color(npc ? npc.robe : look.cloak).offsetHSL(0, 0.12, 0);
    dye.multiplyScalar(1 / Math.max(dye.r, dye.g, dye.b)); // the hue only: the painting keeps its own light and shade
    this.soft.uDye = { value: new THREE.Vector4(dye.r, dye.g, dye.b, !npc && look.id === 'ember' ? 0 : 1) };
    const mat = bodyPatch(new THREE.MeshStandardMaterial({ map: H.map, normalMap: H.normalMap || null, roughness: 0.85, metalness: 0 }), this.soft);
    const mesh = this.mesh = new THREE.SkinnedMesh(H.geo, mat);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    rig.add(mesh);
    const line = this.line = new THREE.SkinnedMesh(H.geo, outlineMaterial(this.soft));
    line.bind(skeleton, new THREE.Matrix4());
    line.frustumCulled = false;
    rig.add(line);
    const B = (key) => bones[H.named[key]];
    this.hand = B('handR');
    this.group.updateMatrixWorld(true);

    // the two parts loose cloth hangs from, each with the direction it faces
    this.parts = [B('chest'), B('hips')].map((bone) => ({
      bone, fwd: new THREE.Vector3(0, 0, 1).transformDirection(_m.copy(bone.matrixWorld).invert()),
      last: new THREE.Vector3(), yaw: 0, has: false,
      a: new THREE.Vector3(), av: new THREE.Vector3(), b: new THREE.Vector3(), bv: new THREE.Vector3(), turn: 0, turnV: 0,
    }));

    // The sword: in the right hand while a move is played, across the back the rest of the time (the clips for
    // standing and running were made for empty hands).
    if (!npc && H.sword) {
      const S = H.sword_;
      const mount = (bone, at) => {
        const sw = new THREE.Mesh(H.sword.geo, swordMaterial(H.sword, look, S.glow));
        sw.castShadow = true; sw.receiveShadow = true;
        const pivot = new THREE.Group();
        // bones live in the rig's own units: undo their scale so the sword keeps its length in metres
        pivot.scale.setScalar(S.length / bone.getWorldScale(_v).x);
        pivot.position.fromArray(at.grip); pivot.quaternion.fromArray(at.quat);
        sw.position.y = -S.hold; // the model stands point down with its pommel at y = 1: hang it from the grip
        pivot.add(sw); bone.add(pivot);
        return sw;
      };
      this.sword = mount(this.hand, S);
      this.sheathed = mount(B('chest'), S.back);
      this.armed = 0; this.armedT = 0;
    }

    // motion clips. Loops run all the time; a move plays part of a one-shot clip, and each of those has two
    // players so that one move can cross into another move from the same clip.
    const mixer = this.mixer = new THREE.AnimationMixer(rig);
    const player = (clip, loop) => {
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setEffectiveWeight(0);
      if (!loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.play(); a.paused = !loop;
      return a;
    };
    const again = (clip) => clip && new THREE.AnimationClip(clip.name, clip.duration, clip.tracks, clip.blendMode);
    this.loops = {}; this.players = {};
    for (const name in H.clips) {
      const c = H.clips[name];
      if (c.loop) {
        const L = this.loops[name] = { low: player(c.low, true), up: player(c.up, true) };
        L.low.time = L.up.time = Math.random() * c.dur;
      } else if (c.whole) this.players[name] = [{ whole: player(c.whole), dur: c.dur, move: null }];
      else this.players[name] = [0, 1].map((i) => ({ low: player(i ? again(c.low) : c.low), up: player(i ? again(c.up) : c.up), top: player(i ? again(c.top) : c.top), dur: c.dur, move: null }));
    }
    this.w = { run: 0, sprint: 0 };
    this.ready = 0; // 0 standing at ease, 1 in the fighting stance
    this.live = []; this.queue = []; this.clock = 0;
    this.breath = Math.random() * 6.28;
  }

  freeze(t) { this.freezeT = Math.max(this.freezeT, t); }

  // one of the game's actions: 'atk' (arg: the step of the combo), 'cast', 'dash', 'ult'
  play(name, dur = 0.4, arg = 0) {
    this.action = name; this.actionT = 0; this.actionDur = dur; this.actionArg = arg;
    let M = this.npc ? null : this.H.moves[name];
    if (!M) return;
    if (Array.isArray(M[0])) M = M[Math.min(arg, M.length - 1)];
    for (const m of this.live) if (!m.over && !this.H.clips[m.def.clip].additive) m.over = true;
    this.queue = M.filter((d) => this.players[d.clip]);
    this.clock = 0;
  }

  hit() {
    const M = this.H.moves.hit;
    if (M && !this.dead) for (const d of M) if (this.players[d.clip]) this._begin(d);
  }

  setDead(d) {
    if (d === this.dead) return;
    this.dead = d; this.deadT = 0;
    if (d) { for (const m of this.live) m.over = true; this.queue.length = 0; }
    else { this.group.scale.setScalar(1); this.group.position.y = 0; }
  }

  _begin(def) {
    const pair = this.players[def.clip];
    let p = pair.find((x) => !x.move);
    if (!p) { p = pair[0].move.w <= pair[1].move.w ? pair[0] : pair[1]; this.live.splice(this.live.indexOf(p.move), 1); }
    const K = def.keys, last = K[K.length - 1];
    p.move = { def, p, t: K[0][0], ct: K[0][1], w: 0, over: false, total: last[0] + (def.end - last[1]) / def.rate };
    this.live.push(p.move);
  }

  update(dt, speed = 0) {
    if (this.freezeT > 0) { this.freezeT -= dt; dt = 0; }
    const H = this.H, t = (this.time += dt), C = H.clips, L = this.loops;
    if (this.action) { this.actionT += dt / this.actionDur; if (this.actionT >= 1) this.action = null; }
    if (this.dead) this.deadT += dt;
    this.wDead = clamp01(this.wDead + (this.dead ? dt : -dt) / 0.18);

    // ---- moves: where each is in its clip, and how strongly it shows
    this.clock += dt;
    while (this.queue.length && this.clock >= this.queue[0].keys[0][0]) this._begin(this.queue.shift());
    this.w.sprint += ((this.action === 'dash' && L.sprint ? 1 : 0) - this.w.sprint) * Math.min(1, dt * 22);
    this.w.run += (clamp01(speed / 3.2) - this.w.run) * Math.min(1, dt * 9);
    const legs = Math.max(this.w.run, this.w.sprint); // how busy the legs are with running: a move then keeps to the upper body
    let wUp = 0, wLow = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i], d = m.def, K = d.keys, last = K[K.length - 1], p = m.p;
      m.t += dt;
      let ct;
      if (m.t >= last[0]) ct = last[1] + (m.t - last[0]) * d.rate;
      else { let j = 0; while (m.t > K[j + 1][0]) j++; ct = K[j][1] + (K[j + 1][1] - K[j][1]) * (m.t - K[j][0]) / (K[j + 1][0] - K[j][0]); }
      const left = m.total - m.t;
      if (left <= 0) { ct = d.end; m.over = true; }
      const target = m.over ? 0 : ease(clamp01(left / (d.out ?? 0.2)));
      m.w += Math.max(-dt / 0.1, Math.min(dt / (d.fade ?? 0.07), target - m.w));
      m.ct = Math.max(0, Math.min(ct, p.dur - 1e-3));
      if (m.over && m.w <= 0) {
        for (const k of ['low', 'up', 'top']) if (p[k]) p[k].setEffectiveWeight(0);
        p.move = null; this.live.splice(i, 1); continue;
      }
      if (!C[d.clip].additive) { wUp += m.w; wLow += m.w * (d.whole ? 1 : 1 - legs); }
    }
    // ---- weights. Per bone they add up to one: moves, then standing / running / sprinting under them, death over all
    const alive = 1 - this.wDead, norm = wUp > 1 ? 1 / wUp : 1;
    for (const m of this.live) {
      const p = m.p, d = m.def;
      if (C[d.clip].additive) { p.up.time = m.ct; p.up.setEffectiveWeight(m.w * (d.gain ?? 1) * alive); continue; }
      const W = m.w * norm * alive, own = d.whole ? 1 : 1 - legs;
      p.low.time = p.up.time = p.top.time = m.ct;
      p.low.setEffectiveWeight(W * own); p.up.setEffectiveWeight(W * own); p.top.setEffectiveWeight(W * (1 - own));
    }
    const baseUp = (1 - wUp * norm) * alive, baseLow = (1 - wLow * norm) * alive;
    const sprint = L.sprint ? this.w.sprint : 0, run = L.run ? this.w.run * (1 - sprint) : 0;
    const set = (loop, w, rate) => { if (!loop) return; loop.low.setEffectiveWeight(baseLow * w); loop.up.setEffectiveWeight(baseUp * w); loop.low.timeScale = loop.up.timeScale = rate; };
    // standing: at ease, or - while the sword is out, and for a moment after - in the fighting stance
    const want = this.sword ? (this.armedT > 0 ? 1 : 0) : (this.action && !this.npc ? 1 : 0);
    this.ready += (want - this.ready) * Math.min(1, dt * (want ? 9 : 2.2));
    const ready = L.ease ? ease(clamp01(this.ready)) : 1, still = 1 - run - sprint;
    set(L.idle, still * ready, 1);
    set(L.ease, still * (1 - ready), 1);
    set(L.run, run, THREE.MathUtils.clamp(speed / (C.run.speed || 3), 0.75, 1.9));
    set(L.sprint, sprint, 1.5);
    const dead = this.players.dead && this.players.dead[0];
    if (dead) { dead.whole.setEffectiveWeight(this.wDead); dead.whole.time = Math.min(dead.dur - 1e-3, this.deadT); }
    this.mixer.update(dt);

    // ---- breath: slow at rest, quicker and deeper after exertion
    this.effort += ((this.action || speed > 1 ? 1 : 0) - this.effort) * Math.min(1, dt * (this.action || speed > 1 ? 0.8 : 0.25));
    this.breath += dt * (1.8 + 2.4 * this.effort);
    const inhale = 0.5 - 0.5 * Math.cos(this.breath);
    this.soft.uBreath.value = (0.012 + 0.009 * this.effort) * inhale * alive / H.scale;

    // ---- cloth and hair: springs trailing the chest and the hips
    this.group.updateMatrixWorld(true);
    const c = Math.cos(-this.group.rotation.y), s = Math.sin(-this.group.rotation.y), h = Math.min(dt, 1 / 30), lim = 0.38 / H.scale;
    this.parts.forEach((P, i) => {
      _v.setFromMatrixPosition(P.bone.matrixWorld);
      _v2.copy(P.fwd).transformDirection(P.bone.matrixWorld);
      const yaw = Math.atan2(_v2.x, _v2.z);
      if (P.has && dt > 0) {
        _v2.copy(_v).sub(P.last).divideScalar(dt);
        if (_v2.lengthSq() > 60 * 60) _v2.set(0, 0, 0); // placed somewhere else, not moved there
        // the push on the cloth, in the body's own frame and the rig's units: against the movement
        _v2.set(_v2.x * c + _v2.z * s, _v2.y * 0.6, -_v2.x * s + _v2.z * c).multiplyScalar(-0.021 / H.scale).clampLength(0, lim);
        let dy = yaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const tv = THREE.MathUtils.clamp(dy / dt * 0.045, -0.6, 0.6);
        const spring = (x, v, target, kS, kD) => { v.addScaledVector(x, -kS * h).addScaledVector(target, kS * h).multiplyScalar(Math.max(0, 1 - kD * h)); x.addScaledVector(v, h); };
        spring(P.a, P.av, _v2, 190, 9);
        spring(P.b, P.bv, _v2.multiplyScalar(1.7), 60, 4.5);
        P.turnV += (tv - P.turn) * 70 * h; P.turnV *= Math.max(0, 1 - 5 * h); P.turn += P.turnV * h;
      }
      P.last.copy(_v); P.yaw = yaw; P.has = true;
      this.soft.uSway.value[i * 2].copy(P.a).clampLength(0, lim * 0.45);
      this.soft.uSway.value[i * 2 + 1].copy(P.b).clampLength(0, lim);
    });
    this.soft.uTurn.value.set(this.parts[0].turn, this.parts[1].turn);
    this.soft.uTime.value = t;

    if (this.sword) {
      // drawn for a move, kept out a moment after it, then back across the shoulders
      if (!this.dead && this.live.some((m) => !m.over && !C[m.def.clip].additive && m.def.sword !== false)) this.armedT = 2.5;
      else this.armedT -= dt;
      this.armed = clamp01(this.armed + (this.armedT > 0 ? dt / 0.1 : -dt / 0.35));
      const show = (mesh, k) => { mesh.visible = k > 0.01; mesh.castShadow = k > 0.5; mesh.material.userData.u.uShow.value = k; };
      show(this.sword, this.armed); show(this.sheathed, 1 - this.armed);
      const hot = this.action === 'ult' || this.action === 'cast' ? 1 : this.action ? 0.45 : 0;
      this.bladeHot += (hot - this.bladeHot) * Math.min(1, dt * 10);
      this.sword.material.userData.u.uHot.value = this.bladeHot + Math.sin(t * 3) * 0.06;
    }
  }

  // is the sword in the hand (and not across the back)? Only then does a swing leave a trail
  get bladeOut() { return !this.sword || this.armed > 0.6; }

  // world-space base and tip of the blade, for sword trails
  bladePoints(base, tip) {
    if (!this.sword) { base.set(0, 1, 0); tip.set(0, 1.2, 0); this.group.localToWorld(base); this.group.localToWorld(tip); return; }
    const S = this.H.sword_;
    this.sword.updateWorldMatrix(true, false);
    base.set(0, S.blade[0], 0).applyMatrix4(this.sword.matrixWorld);
    tip.set(0, S.blade[1], 0).applyMatrix4(this.sword.matrixWorld);
  }

  // The body as it is posed right now, for an afterimage that stays behind: a second mesh on the same
  // geometry, bound to a copy of the skeleton that no longer moves.
  snapshot(material) {
    this.group.updateMatrixWorld(true);
    const still = this.bones.map((b) => { const o = new THREE.Bone(); o.matrixWorld.copy(b.matrixWorld); o.matrixWorldAutoUpdate = false; return o; });
    const skeleton = new THREE.Skeleton(still, this.skeleton.boneInverses);
    const m = new THREE.SkinnedMesh(this.mesh.geometry, material);
    m.bind(skeleton, this.mesh.bindMatrix);
    m.frustumCulled = false;
    m.userData.release = () => skeleton.dispose();
    return m;
  }
}
