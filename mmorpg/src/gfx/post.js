import { THREE, U } from './common.js';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
}

// HDR pipeline: scene -> (depth of field) -> bloom pyramid -> filmic grade.
export class PostFX {
  constructor(renderer, { msaa = 4, dof = true, bloomLevels = 6 } = {}) {
    this.renderer = renderer;
    this.dof = dof;
    this.msaa = msaa;
    this.levels = bloomLevels;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);

    this.mDof = pass(`
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uFocus; uniform float uNear; uniform float uFar; uniform float uMaxBlur;
      varying vec2 vUv;
      float viewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      float coc(float dist) {
        float nearC = clamp((uFocus * 0.6 - dist) / (uFocus * 0.28), 0.0, 1.0);
        float farC = clamp((dist - uFocus * 1.55) / (uFocus * 1.2), 0.0, 1.0) * 0.5;
        return max(nearC, farC);
      }
      void main() {
        vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.0;
        float c0 = coc(viewZ(texture2D(tDepth, vUv).x));
        float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
        for (int i = 1; i <= 22; i++) {
          float r = sqrt(float(i) / 22.0), a = float(i) * 2.39996323 + rot;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uMaxBlur * uTexel;
          float sc = coc(viewZ(texture2D(tDepth, uv).x));
          float w = clamp((max(sc, c0 * step(0.001, sc)) - r) * 5.0 + 0.5, 0.0, 1.0);
          acc += texture2D(tColor, uv).rgb * w; wsum += w;
        }
        gl_FragColor = vec4(acc / wsum, 1.0);
      }`, { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 25 }, uNear: { value: 0.5 }, uFar: { value: 400 }, uMaxBlur: { value: 9 } });

    this.mPre = pass(`
      uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, -0.5)).rgb
               + texture2D(tColor, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, 0.5)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        c *= smoothstep(uThreshold, uThreshold * 2.4, l);
        gl_FragColor = vec4(min(c, vec3(24.0)), 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.9 } });

    this.mDown = pass(`
      uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 4.0;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });

    this.mUp = pass(`
      uniform sampler2D tColor; uniform vec2 uTexel; uniform float uWeight; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 4.0;
        c += (texture2D(tColor, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 0.0)).rgb
            + texture2D(tColor, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
        c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb
           + texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
      }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });

    this.mFinal = pass(`
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure; uniform float uTime; uniform vec2 uRes; uniform float uFlash; uniform float uDanger;
      uniform vec4 uShock[4]; uniform float uSquash; uniform float uAberr; uniform float uDark;
      varying vec2 vUv;
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main() {
        // shockwaves bend the image: each is a ring on the ground, so an ellipse on screen
        vec2 uv = vUv; float bend = 0.0;
        float aspect = uRes.x / uRes.y;
        for (int i = 0; i < 4; i++) {
          vec2 sd = (vUv - uShock[i].xy) * vec2(aspect, 1.0 / uSquash);
          float sl = length(sd);
          float k = (sl - uShock[i].z) / (0.035 + uShock[i].z * 0.16);
          float w = exp(-k * k) * uShock[i].w;
          uv += (sd / max(sl, 1e-4)) * vec2(1.0 / aspect, uSquash) * w;
          bend += abs(w);
        }
        vec2 d = uv - 0.5;
        float r2 = dot(d, d);
        // lens fringe toward the corners; impacts and shock fronts pull the channels apart
        vec2 off = d * (r2 * 0.012 + uAberr * 0.009 + bend * 0.15);
        vec3 c = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
        vec3 bloom = texture2D(tBloom, uv).rgb;
        // eclipse: the world dims while light sources keep burning
        c *= mix(1.0, 0.32 + 0.68 * smoothstep(0.5, 2.5, max(c.r, max(c.g, c.b))), uDark);
        c += bloom * uBloom;
        float vig = smoothstep(0.95, 0.2, length(d * vec2(1.0, 0.92)) * (1.25 + uDark * 0.35));
        c *= mix(0.42 - uDark * 0.25, 1.0, vig);
        c *= uExposure;
        c = aces(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // moonlit grade: cool, slightly lifted shadows; warm highlights stay warm
        c = mix(vec3(l), c, 1.12);
        c += vec3(0.0, 0.006, 0.02) * (1.0 - smoothstep(0.0, 0.3, l));
        c = pow(max(c, 0.0), vec3(0.96));
        c = mix(c, vec3(1.0), uFlash);
        c = mix(c, vec3(c.r + 0.2, c.g * 0.45, c.b * 0.45), uDanger * (1.0 - vig) * (1.0 - vig));
        c = mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
        c += (g - 0.5) * 0.022;
        gl_FragColor = vec4(c, 1.0);
      }`, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.8 }, uExposure: { value: 1.35 }, uTime: U.uTime, uRes: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uDanger: { value: 0 }, uShock: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0.5, 0.5, 0, 0)) }, uSquash: { value: 0.7 }, uAberr: { value: 0 }, uDark: { value: 0 } });

    this.rtScene = null;
    this.setSize(2, 2);
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    this.w = w; this.h = h;
    for (const rt of [this.rtScene, this.rtDof, ...(this.mips || [])]) if (rt) rt.dispose();
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.msaa, depthTexture, depthBuffer: true });
    this.rtDof = this.dof ? new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }) : null;
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    U.uResolution.value.set(w, h);
    this.mFinal.uniforms.uRes.value.set(w, h);
  }

  _draw(mat, target, clear = true) {
    const r = this.renderer;
    this.quad.material = mat;
    r.setRenderTarget(target);
    if (clear) r.clear();
    r.render(this.fsScene, this.cam);
  }

  render(scene, camera, focusDist) {
    const r = this.renderer;
    r.autoClear = false;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    let src = this.rtScene.texture;
    if (this.dof) {
      const u = this.mDof.uniforms;
      u.tColor.value = src; u.tDepth.value = this.rtScene.depthTexture;
      u.uTexel.value.set(1 / this.w, 1 / this.h);
      u.uFocus.value = focusDist; u.uNear.value = camera.near; u.uFar.value = camera.far;
      u.uMaxBlur.value = 8.5 * this.h / 1080;
      this._draw(this.mDof, this.rtDof);
      src = this.rtDof.texture;
    }
    // bloom pyramid
    this.mPre.uniforms.tColor.value = src;
    this.mPre.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this._draw(this.mPre, this.mips[0]);
    for (let i = 1; i < this.levels; i++) {
      this.mDown.uniforms.tColor.value = this.mips[i - 1].texture;
      this.mDown.uniforms.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this._draw(this.mDown, this.mips[i]);
    }
    for (let i = this.levels - 1; i > 0; i--) {
      this.mUp.uniforms.tColor.value = this.mips[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.mUp.uniforms.uWeight.value = 0.85;
      this._draw(this.mUp, this.mips[i - 1], false);
    }
    this.mFinal.uniforms.tScene.value = src;
    this.mFinal.uniforms.tBloom.value = this.mips[0].texture;
    this._draw(this.mFinal, null);
  }
}
