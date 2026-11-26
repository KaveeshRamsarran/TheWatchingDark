// THE WATCHING DARK - post processing
// The scene renders into an HDR target (with a depth texture) at a dynamic resolution.
// Then, at half resolution:
//   - ambient occlusion: contact shadows in corners, under things, where walls meet floors
//   - volumetric light: the flashlight, lamps and flames lighting up the dust in the air,
//     marched along each view ray and stopped by whatever surface the ray hits
// and finally one composite pass: FXAA, occlusion + light, bloom, ACES tone mapping,
// grade, film grain, vignette and the sanity / camcorder effects.
'use strict';

const PostFX = (() => {
    let renderer = null;
    let rtScene = null, rtA = null, rtB = null;
    let rtAO = null, rtAO2 = null, rtVol = null, rtVol2 = null;
    let quadScene, quadCam, quad;
    let brightMat, blurMat, finalMat, aoMat, volMat, smoothMat;
    let blackTex, whiteTex;
    let bloomEnabled = true;
    let hasDepth = false;
    const features = { ao: false, volumetric: false, volSteps: 16 };
    const size = { w: 1, h: 1 };
    const MAX_LIGHTS = 6;
    const frame = { camera: null, lights: [], fogDensity: 0.05, density: 0.05 };

    const vertex = /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }`;

    // Shared GLSL: view-space position from depth, and per-pixel noise for dithering
    const depthLib = /* glsl */`
        uniform sampler2D tDepth;
        uniform mat4 projInv;
        vec3 viewPosAt(vec2 uv, float d) {
            vec4 c = vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
            vec4 v = projInv * c;
            return v.xyz / v.w;
        }
        vec3 viewPos(vec2 uv) { return viewPosAt(uv, texture2D(tDepth, uv).x); }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    `;

    function makeTarget(w, h, type, depth = false) {
        return new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type,
            depthBuffer: depth,
            stencilBuffer: false
        });
    }

    function solid(v) {
        const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1, THREE.RGBAFormat);
        t.needsUpdate = true;
        return t;
    }

    function init(r) {
        renderer = r;
        const gl2 = renderer.capabilities.isWebGL2;
        const hdr = gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        rtScene = makeTarget(1, 1, hdr, true);
        // A depth texture lets the occlusion and volumetric passes see the scene's shape
        hasDepth = gl2 || !!renderer.extensions.get('WEBGL_depth_texture');
        if (hasDepth) {
            rtScene.depthTexture = new THREE.DepthTexture(1, 1);
            rtScene.depthTexture.type = THREE.UnsignedIntType;
        }
        rtA = makeTarget(1, 1, hdr);
        rtB = makeTarget(1, 1, hdr);
        rtAO = makeTarget(1, 1, THREE.UnsignedByteType);
        rtAO2 = makeTarget(1, 1, THREE.UnsignedByteType);
        rtVol = makeTarget(1, 1, hdr);
        rtVol2 = makeTarget(1, 1, hdr);

        blackTex = solid(0);
        whiteTex = solid(255);

        quadScene = new THREE.Scene();
        quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        quad.frustumCulled = false;
        quadScene.add(quad);

        brightMat = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: null }, threshold: { value: 0.85 } },
            vertexShader: vertex,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform float threshold;
                varying vec2 vUv;
                void main() {
                    vec3 c = texture2D(tDiffuse, vUv).rgb;
                    float l = max(max(c.r, c.g), c.b);
                    float k = max(l - threshold, 0.0) / max(l, 0.0001);
                    gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0);
                }`,
            depthTest: false, depthWrite: false
        });

        blurMat = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: null }, direction: { value: new THREE.Vector2(1, 0) } },
            vertexShader: vertex,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform vec2 direction;
                varying vec2 vUv;
                void main() {
                    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270;
                    sum += texture2D(tDiffuse, vUv + direction * 1.3846153).rgb * 0.3162162;
                    sum += texture2D(tDiffuse, vUv - direction * 1.3846153).rgb * 0.3162162;
                    sum += texture2D(tDiffuse, vUv + direction * 3.2307692).rgb * 0.0702702;
                    sum += texture2D(tDiffuse, vUv - direction * 3.2307692).rgb * 0.0702702;
                    gl_FragColor = vec4(sum, 1.0);
                }`,
            depthTest: false, depthWrite: false
        });

        // ---- Ambient occlusion (depth-only SSAO, normals rebuilt from depth) -------------
        aoMat = new THREE.ShaderMaterial({
            uniforms: {
                tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() },
                texel: { value: new THREE.Vector2(1, 1) }, radius: { value: 0.7 }, fadeFar: { value: 30 }
            },
            vertexShader: vertex,
            fragmentShader: depthLib + /* glsl */`
                uniform mat4 proj;
                uniform vec2 texel;
                uniform float radius, fadeFar;
                varying vec2 vUv;
                const int N = 12;
                void main() {
                    float d = texture2D(tDepth, vUv).x;
                    if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
                    vec3 p = viewPosAt(vUv, d);
                    // Normal from the flatter of the two neighbours on each axis (clean edges)
                    vec3 px = viewPos(vUv + vec2(texel.x, 0.0)) - p, nx = p - viewPos(vUv - vec2(texel.x, 0.0));
                    vec3 py = viewPos(vUv + vec2(0.0, texel.y)) - p, ny = p - viewPos(vUv - vec2(0.0, texel.y));
                    vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
                    vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
                    vec3 n = normalize(cross(dx, dy));
                    float a0 = ign(gl_FragCoord.xy) * 6.2831853;
                    vec3 rv = vec3(cos(a0), sin(a0), 0.0);
                    vec3 t = normalize(rv - n * dot(rv, n));
                    vec3 b = cross(n, t);
                    float occ = 0.0;
                    for (int i = 0; i < N; i++) {
                        float fi = float(i);
                        float r = (fi + 0.5) / float(N);
                        float ang = fi * 2.3999632;
                        vec3 k = vec3(cos(ang) * sqrt(r), sin(ang) * sqrt(r), sqrt(1.0 - r));
                        vec3 s = p + (t * k.x + b * k.y + n * k.z) * radius * mix(0.12, 1.0, r * r);
                        vec4 c = proj * vec4(s, 1.0);
                        vec2 suv = c.xy / c.w * 0.5 + 0.5;
                        float sz = viewPos(suv).z;
                        float range = smoothstep(0.0, 1.0, radius / max(abs(p.z - sz), 0.0001));
                        occ += (sz >= s.z + 0.025 ? 1.0 : 0.0) * range;
                    }
                    float ao = 1.0 - occ / float(N);
                    ao = ao * ao;   // contact shadows should read clearly, not as a faint smudge
                    ao = mix(1.0, ao, 1.0 - smoothstep(fadeFar * 0.6, fadeFar, -p.z));
                    gl_FragColor = vec4(vec3(ao), 1.0);
                }`,
            depthTest: false, depthWrite: false
        });

        // ---- Volumetric light: march each view ray through the lights' cones ---------------
        volMat = new THREE.ShaderMaterial({
            defines: { MAX_LIGHTS, MAX_STEPS: 32 },
            uniforms: {
                tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
                camPos: { value: new THREE.Vector3() }, time: { value: 0 }, steps: { value: 16 },
                density: { value: 0.05 }, fogDensity: { value: 0.05 }, maxDist: { value: 32 },
                lightCount: { value: 0 },
                lPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
                lDir: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
                lCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
                // Up to two lights' real shadow maps: walls and pillars cut dark shafts through the beam
                shadowIdx0: { value: -1 }, shadowIdx1: { value: -1 },
                shadowMap0: { value: null }, shadowMap1: { value: null },
                shadowMat0: { value: new THREE.Matrix4() }, shadowMat1: { value: new THREE.Matrix4() }
            },
            vertexShader: vertex,
            fragmentShader: '#include <packing>\n' + depthLib + /* glsl */`
                uniform mat4 camWorld;
                uniform vec3 camPos;
                uniform int shadowIdx0, shadowIdx1;
                uniform sampler2D shadowMap0, shadowMap1;
                uniform mat4 shadowMat0, shadowMat1;
                float shadowVis(sampler2D map, mat4 m, vec3 p) {
                    vec4 c = m * vec4(p, 1.0);
                    if (c.w <= 0.0) return 1.0;
                    c.xyz /= c.w;
                    if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
                    return step(c.z - 0.0015, unpackRGBAToDepth(texture2D(map, c.xy)));
                }
                uniform float time, steps, density, fogDensity, maxDist;
                uniform int lightCount;
                uniform vec4 lPos[MAX_LIGHTS];   // xyz position, w range
                uniform vec4 lDir[MAX_LIGHTS];   // xyz direction, w cos(outer angle) (< -1.5 = point light)
                uniform vec4 lCol[MAX_LIGHTS];   // rgb colour x intensity, w cos(inner angle)
                varying vec2 vUv;
                float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
                float noise3(vec3 p) {
                    vec3 i = floor(p), f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
                }
                void main() {
                    float d = texture2D(tDepth, vUv).x;
                    vec3 vp = viewPosAt(vUv, min(d, 0.99995));
                    vec3 wp = (camWorld * vec4(vp, 1.0)).xyz;
                    vec3 ray = wp - camPos;
                    float len = min(length(ray), maxDist);
                    vec3 rd = normalize(ray);
                    float stepLen = len / steps;
                    float jitter = ign(gl_FragCoord.xy + fract(time * 7.0) * 61.0);
                    vec3 acc = vec3(0.0);
                    for (int i = 0; i < MAX_STEPS; i++) {
                        if (float(i) >= steps) break;
                        float t = (float(i) + jitter) * stepLen;
                        vec3 p = camPos + rd * t;
                        // Dust drifts slowly through the air
                        float dust = 0.5 + 0.5 * noise3(p * 0.55 + vec3(0.0, -time * 0.06, time * 0.04));
                        vec3 inscat = vec3(0.0);
                        for (int l = 0; l < MAX_LIGHTS; l++) {
                            if (l >= lightCount) break;
                            vec3 L = lPos[l].xyz - p;
                            float dist = length(L);
                            vec3 ld = L / max(dist, 0.0001);
                            float att = 1.0 / (1.0 + dist * dist * 0.12) * (1.0 - smoothstep(lPos[l].w * 0.55, lPos[l].w, dist));
                            float cone = 1.0;
                            if (lDir[l].w > -1.5) cone = smoothstep(lDir[l].w, lCol[l].w, dot(-ld, lDir[l].xyz));
                            float lit = att * cone;
                            if (lit < 0.0005) continue;
                            if (l == shadowIdx0) lit *= shadowVis(shadowMap0, shadowMat0, p);
                            else if (l == shadowIdx1) lit *= shadowVis(shadowMap1, shadowMat1, p);
                            // Henyey-Greenstein: dust scatters light mostly forward
                            float g = 0.3, ct = dot(ld, rd);
                            float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5);
                            inscat += lCol[l].rgb * lit * phase;
                        }
                        acc += inscat * density * dust * stepLen * exp(-fogDensity * t);
                    }
                    gl_FragColor = vec4(acc, 1.0);
                }`,
            depthTest: false, depthWrite: false
        });

        // ---- Depth-aware smoothing for the half-resolution passes (no halos at edges) ------
        smoothMat = new THREE.ShaderMaterial({
            uniforms: {
                tSrc: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2(1, 1) },
                near: { value: 0.05 }, far: { value: 90 }
            },
            vertexShader: vertex,
            fragmentShader: /* glsl */`
                uniform sampler2D tSrc, tDepth;
                uniform vec2 texel;
                uniform float near, far;
                varying vec2 vUv;
                float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
                void main() {
                    float dc = lin(texture2D(tDepth, vUv).x);
                    vec3 sum = vec3(0.0);
                    float w = 0.0;
                    for (int x = -2; x <= 1; x++) {
                        for (int y = -2; y <= 1; y++) {
                            vec2 o = (vec2(float(x), float(y)) + 0.5) * texel;
                            float wt = exp(-abs(dc - lin(texture2D(tDepth, vUv + o).x)) * 3.0 / max(dc * 0.08, 0.05));
                            sum += texture2D(tSrc, vUv + o).rgb * wt;
                            w += wt;
                        }
                    }
                    gl_FragColor = vec4(sum / max(w, 0.0001), 1.0);
                }`,
            depthTest: false, depthWrite: false
        });

        finalMat = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null },
                tBloom: { value: blackTex },
                tAO: { value: whiteTex },
                tVol: { value: blackTex },
                sceneTexel: { value: new THREE.Vector2(1, 1) },
                aoStrength: { value: 0.0 },
                volStrength: { value: 0.0 },
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(1, 1) },
                exposure: { value: 1.0 },
                bloomStrength: { value: 0.9 },
                grain: { value: 0.05 },
                vignette: { value: 0.55 },
                aberration: { value: 0.0 },
                warp: { value: 0.0 },
                pulse: { value: 0.0 },
                flash: { value: 0.0 },
                flashColor: { value: new THREE.Color(1, 1, 1) },
                blackout: { value: 0.0 },
                saturation: { value: 0.85 },
                tint: { value: new THREE.Color(1, 1, 1) },
                lift: { value: new THREE.Color(0.0, 0.004, 0.01) },
                nightVision: { value: 0.0 },
                interference: { value: 0.0 },
                debugView: { value: 0 }
            },
            vertexShader: vertex,
            fragmentShader: /* glsl */`
                uniform sampler2D tScene, tBloom, tAO, tVol;
                uniform vec2 sceneTexel;
                uniform float aoStrength, volStrength;
                uniform float time, exposure, bloomStrength, grain, vignette, aberration, warp, pulse, flash, blackout, saturation;
                uniform float nightVision, interference, debugView;
                uniform vec2 resolution;
                uniform vec3 flashColor, tint, lift;
                varying vec2 vUv;

                vec3 aces(vec3 x) {
                    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
                }
                float hash(vec2 p) {
                    p = fract(p * vec2(443.897, 441.423));
                    p += dot(p, p.yx + 19.19);
                    return fract((p.x + p.y) * p.x);
                }
                vec3 toSRGB(vec3 c) {
                    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
                }
                // Edge luminance on a compressed (tone-mapped-like) scale
                float lumaOf(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }

                // FXAA (console/"fast" variant): smooths jagged, crawling edges
                vec3 fxaa(vec2 uv) {
                    vec3 nw = texture2D(tScene, uv + vec2(-1.0, -1.0) * sceneTexel).rgb;
                    vec3 ne = texture2D(tScene, uv + vec2(1.0, -1.0) * sceneTexel).rgb;
                    vec3 sw = texture2D(tScene, uv + vec2(-1.0, 1.0) * sceneTexel).rgb;
                    vec3 se = texture2D(tScene, uv + vec2(1.0, 1.0) * sceneTexel).rgb;
                    vec3 m = texture2D(tScene, uv).rgb;
                    float lNW = lumaOf(nw), lNE = lumaOf(ne), lSW = lumaOf(sw), lSE = lumaOf(se), lM = lumaOf(m);
                    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
                    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
                    if (lMax - lMin < max(0.03, lMax * 0.12)) return m;
                    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
                    float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
                    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
                    dir = clamp(dir * rcp, -8.0, 8.0) * sceneTexel;
                    vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
                    vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
                    float lB = lumaOf(b);
                    return (lB < lMin || lB > lMax) ? a : b;
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 centered = uv - 0.5;

                    // Sanity loss bends the world
                    if (warp > 0.0) {
                        float r = length(centered);
                        uv += centered * r * r * warp * 0.35;
                        uv += warp * 0.004 * vec2(sin(uv.y * 23.0 + time * 2.1), cos(uv.x * 17.0 + time * 1.6));
                    }

                    // Camcorder signal tearing: horizontal bands jump sideways
                    if (interference > 0.0) {
                        float band = floor(uv.y * 48.0);
                        float tear = hash(vec2(band, floor(time * 24.0))) - 0.5;
                        float on = step(1.0 - interference * 0.6, hash(vec2(band * 1.7, floor(time * 12.0))));
                        uv.x += tear * on * interference * 0.08;
                    }

                    vec3 col = fxaa(uv);
                    if (aberration > 0.001) {
                        vec2 dir = centered * aberration * 0.012;
                        col.r = texture2D(tScene, uv + dir).r;
                        col.b = texture2D(tScene, uv - dir).b;
                    }
                    // Contact shadows, then the light hanging in the air
                    col *= mix(1.0, texture2D(tAO, uv).r, aoStrength);
                    col += texture2D(tVol, uv).rgb * volStrength;
                    col += texture2D(tBloom, uv).rgb * bloomStrength;
                    if (debugView > 0.5) {
                        gl_FragColor = vec4(debugView < 1.5 ? texture2D(tAO, uv).rgb : texture2D(tVol, uv).rgb * 4.0, 1.0);
                        return;
                    }

                    col = aces(col * exposure);
                    col = toSRGB(col);

                    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
                    col = mix(vec3(l), col, saturation) * tint + lift * (1.0 - l);

                    // Night-vision viewfinder: green phosphor, scanlines and a slow rolling bar
                    if (nightVision > 0.001) {
                        float nl = clamp(pow(l, 0.8) * 1.3, 0.0, 1.0);
                        float scan = 0.84 + 0.16 * sin(gl_FragCoord.y * 1.6);
                        float roll = 0.92 + 0.08 * sin(vUv.y * 5.0 - time * 2.4);
                        vec3 nv = vec3(0.34, 1.0, 0.45) * nl * scan * roll + vec3(0.0, 0.03, 0.008);
                        nv += (hash(floor(uv * resolution * 0.5) + fract(time * 13.7) * 37.0) - 0.5) * 0.08 * (0.5 + interference);
                        col = mix(col, nv, nightVision);
                    }

                    float vig = smoothstep(0.95, 0.25, length(centered * vec2(1.0, 0.9)));
                    col *= mix(1.0, vig, vignette);
                    col += vec3(0.4, 0.0, 0.02) * pulse * (1.0 - vig);

                    float n = hash(uv * resolution + fract(time * 7.13) * 91.7) - 0.5;
                    col += n * grain * (0.6 + 0.4 * (1.0 - l));

                    col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
                    col *= 1.0 - clamp(blackout, 0.0, 1.0);
                    gl_FragColor = vec4(col, 1.0);
                }`,
            depthTest: false, depthWrite: false
        });
    }

    function setSize(canvasW, canvasH, scale) {
        const w = Math.max(2, Math.floor(canvasW * scale));
        const h = Math.max(2, Math.floor(canvasH * scale));
        if (w === size.w && h === size.h) return;
        size.w = w;
        size.h = h;
        rtScene.setSize(w, h);
        const bw = Math.max(2, Math.floor(w / 4)), bh = Math.max(2, Math.floor(h / 4));
        rtA.setSize(bw, bh);
        rtB.setSize(bw, bh);
        const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
        for (const t of [rtAO, rtAO2, rtVol, rtVol2]) t.setSize(hw, hh);
        finalMat.uniforms.resolution.value.set(canvasW, canvasH);
        finalMat.uniforms.sceneTexel.value.set(1 / w, 1 / h);
    }

    function pass(material, target) {
        quad.material = material;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, quadCam);
    }

    // Per-frame inputs for the depth effects: the camera, the lights in the air, fog
    function setFrame(camera, lights, fogDensity, density) {
        frame.camera = camera;
        frame.lights = lights;
        frame.fogDensity = fogDensity;
        frame.density = density;
    }

    const smoothPass = (src, out) => {
        smoothMat.uniforms.tSrc.value = src.texture;
        smoothMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        pass(smoothMat, out);
    };

    function render(scene, camera, time) {
        renderer.setRenderTarget(rtScene);
        renderer.render(scene, camera);

        const u = finalMat.uniforms;
        const depth = hasDepth ? rtScene.depthTexture : null;
        if (depth) {
            smoothMat.uniforms.tDepth.value = depth;
            smoothMat.uniforms.near.value = camera.near;
            smoothMat.uniforms.far.value = camera.far;
        }

        // ---- Ambient occlusion
        if (depth && features.ao) {
            const a = aoMat.uniforms;
            a.tDepth.value = depth;
            a.projInv.value.copy(camera.projectionMatrixInverse);
            a.proj.value.copy(camera.projectionMatrix);
            a.texel.value.set(1 / rtAO.width, 1 / rtAO.height);
            a.fadeFar.value = Math.min(32, camera.far * 0.6);
            pass(aoMat, rtAO);
            smoothPass(rtAO, rtAO2);
            u.tAO.value = rtAO2.texture;
            u.aoStrength.value = 0.85;
        } else {
            u.tAO.value = whiteTex;
            u.aoStrength.value = 0;
        }

        // ---- Volumetric light
        const lights = frame.lights;
        if (depth && features.volumetric && lights.length) {
            const v = volMat.uniforms;
            v.tDepth.value = depth;
            v.projInv.value.copy(camera.projectionMatrixInverse);
            v.camWorld.value.copy(camera.matrixWorld);
            v.camPos.value.setFromMatrixPosition(camera.matrixWorld);
            v.time.value = time;
            v.steps.value = features.volSteps;
            v.density.value = frame.density;
            v.fogDensity.value = frame.fogDensity;
            v.maxDist.value = Math.min(36, camera.far);
            const n = Math.min(lights.length, MAX_LIGHTS);
            v.lightCount.value = n;
            v.shadowIdx0.value = v.shadowIdx1.value = -1;
            v.shadowMap0.value = v.shadowMap1.value = blackTex;
            let shadows = 0;
            for (let i = 0; i < n; i++) {
                const L = lights[i];
                let w = L.weight === undefined ? 1 : L.weight;
                const sh = L.shadow && L.shadow.map ? L.shadow : null;
                if (sh && shadows < 2) {
                    v['shadowIdx' + shadows].value = i;
                    v['shadowMap' + shadows].value = sh.map.texture;
                    v['shadowMat' + shadows].value.copy(sh.matrix);
                    shadows++;
                    w = Math.max(w, 0.8);   // a beam that walls can cut may be bright
                }
                v.lPos.value[i].set(L.pos.x, L.pos.y, L.pos.z, L.range);
                if (L.spot) v.lDir.value[i].set(L.dir.x, L.dir.y, L.dir.z, L.cosOuter);
                else v.lDir.value[i].set(0, -1, 0, -2);
                v.lCol.value[i].set(L.color.r * w, L.color.g * w, L.color.b * w, L.cosInner || 1);
            }
            pass(volMat, rtVol);
            smoothPass(rtVol, rtVol2);
            u.tVol.value = rtVol2.texture;
            u.volStrength.value = 1;
        } else {
            u.tVol.value = blackTex;
            u.volStrength.value = 0;
        }

        // ---- Bloom
        if (bloomEnabled) {
            brightMat.uniforms.tDiffuse.value = rtScene.texture;
            pass(brightMat, rtA);
            blurMat.uniforms.tDiffuse.value = rtA.texture;
            blurMat.uniforms.direction.value.set(1 / rtA.width, 0);
            pass(blurMat, rtB);
            blurMat.uniforms.tDiffuse.value = rtB.texture;
            blurMat.uniforms.direction.value.set(0, 1 / rtA.height);
            pass(blurMat, rtA);
            // A second, wider iteration for a softer halo
            blurMat.uniforms.tDiffuse.value = rtA.texture;
            blurMat.uniforms.direction.value.set(2 / rtA.width, 0);
            pass(blurMat, rtB);
            blurMat.uniforms.tDiffuse.value = rtB.texture;
            blurMat.uniforms.direction.value.set(0, 2 / rtA.height);
            pass(blurMat, rtA);
            u.tBloom.value = rtA.texture;
        } else {
            u.tBloom.value = blackTex;
        }

        u.tScene.value = rtScene.texture;
        u.time.value = time;
        pass(finalMat, null);
    }

    return {
        init, setSize, render, setFrame,
        get uniforms() { return finalMat.uniforms; },
        setBloom(on) { bloomEnabled = on; },
        // ao / volumetric on or off, and how many steps the volumetric march takes
        setFeatures(f) { Object.assign(features, f); },
        get supported() { return hasDepth; },
        get bloomThreshold() { return brightMat.uniforms.threshold; }
    };
})();
