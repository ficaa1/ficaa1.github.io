// One material for the Photos panes and music seek bars. Geometry and scheduling belong to each surface.
export const glassDefaults = Object.freeze({ blur: .018, refraction: .065, dispersion: .011, bendWidth: .13,
  rimWidth: .255, saturation: 1, brightness: .88, opacity: 1, resolution: 1280 });

export const glassVertex = `attribute vec2 position; varying vec2 uv;
      void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;

export const glassBlur = `precision mediump float; varying vec2 uv;
        uniform sampler2D image; uniform vec2 stepSize; uniform vec2 crop;
        vec3 sampleAt(vec2 p) { return texture2D(image, (p - .5) * crop + .5).rgb; }
        void main() {
          vec3 c = sampleAt(uv) * .227027;
          c += (sampleAt(uv + stepSize * 1.384615) + sampleAt(uv - stepSize * 1.384615)) * .316216;
          c += (sampleAt(uv + stepSize * 3.230769) + sampleAt(uv - stepSize * 3.230769)) * .070270;
          gl_FragColor = vec4(c, 1.);
        }`;

export const glassComposite = `precision highp float; varying vec2 uv;
        uniform sampler2D film; uniform sampler2D frost; uniform vec2 crop; uniform vec2 view;
        uniform vec4 pane; uniform float radius;
        uniform float refraction; uniform float dispersion; uniform float bendWidth; uniform float rimWidth;
        uniform float saturation; uniform float brightness; uniform float opacity;
        vec3 sampleAt(vec2 p) { return texture2D(film, (p - .5) * crop + .5).rgb; }
        void main() {
          vec2 point = vec2(uv.x, 1. - uv.y) * view;
          vec4 r = pane; vec2 local = point - r.xy;
          vec2 q = abs(local - r.zw * .5) - r.zw * .5 + radius;
          float distance = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
          vec2 p = local / r.zw;
          vec2 bend = .5 * (1. - smoothstep(vec2(0.), vec2(bendWidth), p))
                    - .5 * smoothstep(vec2(1. - bendWidth), vec2(1.), p);
          bend *= r.zw / view * vec2(1., -1.);
          vec2 edge = 1. - smoothstep(vec2(0.), vec2(rimWidth), min(p, 1. - p));
          float rim = 1. - (1. - edge.x) * (1. - edge.y);
          vec3 bent = vec3(sampleAt(uv + bend * (refraction + dispersion)).r,
                           sampleAt(uv + bend * refraction).g, sampleAt(uv + bend * (refraction - dispersion)).b);
          vec3 glass = mix(texture2D(frost, uv).rgb, bent, rim);
          glass = mix(vec3(dot(glass, vec3(.2126, .7152, .0722))), glass, saturation) * brightness;
          gl_FragColor = vec4(glass, clamp(-distance, 0., 1.) * opacity);
        }`;
