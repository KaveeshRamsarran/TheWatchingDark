// THE WATCHING DARK - post processing
// Scene renders into an HDR target at a dynamic resolution, then a single composite pass
// applies bloom, ACES tone mapping, film grain, vignette and sanity-driven distortion.
'use strict';

const PostFX = (() => {
    let renderer = null;
    let rtScene = null, rtA = null, rtB = null;
    let quadScene, quadCam, quad;
    let brightMat, blurMat, finalMat;
    let blackTex;
    let bloomEnabled = true;
    const size = { w: 1, h: 1 };

    const vertex = /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }`;

    function makeTarget(w, h, type) {
        return new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type,
            depthBuffer: true,
            stencilBuffer: false
        });
    }

    function init(r) {
        renderer = r;
        const hdr = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
        rtScene = makeTarget(1, 1, hdr);
        rtA = makeTarget(1, 1, hdr);
        rtB = makeTarget(1, 1, hdr);
        rtA.depthBuffer = false;
        rtB.depthBuffer = false;

        const data = new Uint8Array([0, 0, 0, 255]);
        blackTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
        blackTex.needsUpdate = true;

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

        finalMat = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null },
                tBloom: { value: blackTex },
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
                interference: { value: 0.0 }
            },
            vertexShader: vertex,
            fragmentShader: /* glsl */`
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform float time, exposure, bloomStrength, grain, vignette, aberration, warp, pulse, flash, blackout, saturation;
                uniform float nightVision, interference;
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

                    vec2 dir = centered * aberration * 0.012;
                    vec3 col;
                    col.r = texture2D(tScene, uv + dir).r;
                    col.g = texture2D(tScene, uv).g;
                    col.b = texture2D(tScene, uv - dir).b;
                    col += texture2D(tBloom, uv).rgb * bloomStrength;

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
        finalMat.uniforms.resolution.value.set(canvasW, canvasH);
    }

    function pass(material, target) {
        quad.material = material;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, quadCam);
    }

    function render(scene, camera, time) {
        renderer.setRenderTarget(rtScene);
        renderer.render(scene, camera);

        const u = finalMat.uniforms;
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
        init, setSize, render,
        get uniforms() { return finalMat.uniforms; },
        setBloom(on) { bloomEnabled = on; },
        get bloomThreshold() { return brightMat.uniforms.threshold; }
    };
})();
