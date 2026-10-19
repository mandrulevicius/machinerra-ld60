// The live ground (groundlive.ts): one pass over the painted land, under everything that stands on it. Premultiplied
// output, so one pixel can both darken (alpha: cloud and zeppelin shadows, the canopy's shade) and add light (rgb with
// no alpha: glints, motes, drifting sand, the breathing glow). Every layer's strength is a uniform; a biome sets them
// (`LIVE` in groundlive.ts) and the randomness (wind, gusts, the zeppelin's passes) comes from there, seeded by the land.
// uResolution is the land's size in px (the quad covers the whole land); uTime is supplied by harness/kit/shader.ts.
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform float uSeed;
uniform float uDay;      // 1 full day .. 0 deep night
uniform vec3 uAmb;       // the sky's ambient colour (0..1): reflected light follows it, emitted light does not
uniform vec2 uCloudOff;  // the clouds' drift so far (px), integrated from the wind
uniform float uCloud;    // cloud shadow strength
uniform vec3 uShade;     // the colour shadows tint toward (cool, as the painted figures' shadows are)
uniform vec4 uZep;       // the D-city's shadow: x, y (px), heading (rad), strength
uniform vec2 uWind;      // the wind's heading (unit)
uniform float uDriftOff; // how far the drift has travelled along the wind (px)
uniform float uGust;     // 0 calm .. 1 a gust
uniform float uDrift;    // drift strength
uniform vec3 uDriftCol;
uniform vec4 uGlint;     // cell px, share of cells, day weight, night weight
uniform vec3 uGlintCol;
uniform vec4 uMote;      // cell px, share of cells, rise px/s, size px
uniform vec3 uMoteCol;
uniform vec2 uMoteVis;   // day, night visibility
uniform float uCanopy;   // dappled shade and sun spots swaying (the jungle)
uniform vec4 uPulse;     // strength, scale px, speed, 0
uniform vec3 uPulseCol;

varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.03 + 17.0) * 0.3 + noise(p * 4.1 + 41.0) * 0.15; }

// The Wanderer seen from below: hull, gondola and four fins, soft at the edge (1 inside .. 0 outside).
float zeppelin(vec2 p) {
    vec2 d = p - uZep.xy;
    float c = cos(uZep.z), s = sin(uZep.z);
    vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    float hull = 1.0 - smoothstep(0.85, 1.05, length(q / vec2(300.0, 92.0)));
    float gond = 1.0 - smoothstep(0.8, 1.1, length((q - vec2(30.0, 0.0)) / vec2(90.0, 30.0)));
    vec2 f = vec2(q.x + 270.0, abs(q.y));
    float fin = (1.0 - smoothstep(0.0, 14.0, abs(f.y - 70.0 - f.x * 0.2) - 14.0)) * step(-40.0, f.x) * step(f.x, 70.0);
    return max(max(hull, gond), fin * 0.9);
}

void main() {
    vec2 p = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution; // land px, y down
    float shade = 0.0;   // alpha toward uShade
    vec3 light = vec3(0.0);

    // Clouds: big soft shadows sliding with the wind. Only the sun casts them.
    if (uCloud > 0.0) {
        float c = fbm((p + uCloudOff) / 620.0);
        shade += smoothstep(0.44, 0.66, c) * uCloud * uDay;
    }
    // The D-city passes over now and then (groundlive.ts schedules it): its shadow, darker than a cloud's.
    if (uZep.w > 0.0) shade = max(shade, zeppelin(p) * uZep.w * (0.35 + 0.65 * uDay));

    // Canopy: leaf shade with sun coming through, swaying in the gusts.
    if (uCanopy > 0.0) {
        vec2 sway = vec2(sin(uTime * 0.9 + p.y * 0.004), cos(uTime * 0.7 + p.x * 0.003)) * (3.0 + 7.0 * uGust);
        float l = fbm((p + sway) / 70.0 + 3.0);
        shade += smoothstep(0.5, 0.62, l) * 0.22 * uCanopy * uDay;
        light += uAmb * vec3(1.0, 0.9, 0.55) * smoothstep(0.26, 0.2, l) * 0.07 * uCanopy * uDay;
    }

    // Drift: streaks of whatever the wind carries (sand, leaves, snow, ash, mist), stronger in a gust.
    if (uDrift > 0.0) {
        vec2 w = uWind, n = vec2(-w.y, w.x);
        vec2 q = vec2(dot(p, w), dot(p, n));
        float band = noise(vec2((q.x - uDriftOff) / 220.0, q.y / 20.0));
        float pat = noise(vec2((q.x - uDriftOff * 0.6) / 420.0, q.y / 300.0));
        float s = smoothstep(0.62, 0.92, band) * smoothstep(0.35, 0.75, pat) * (0.12 + 0.88 * uGust);
        light += uDriftCol * uAmb * s * uDrift;
    }

    // Glints: old metal in the ground catching the light, each on its own clock.
    if (uGlint.y > 0.0) {
        vec2 g = p / uGlint.x, id = floor(g), f = fract(g);
        float h = hash(id);
        if (h < uGlint.y) {
            vec2 at = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.7 + 0.15;
            float rate = 0.4 + hash(id + 1.3) * 1.2;
            float tw = pow(max(0.0, sin(uTime * rate + h * 40.0)), 30.0);
            vec2 d = abs(f - at) * uGlint.x;
            float star = max(1.0 - smoothstep(0.0, 1.2, d.x) , 0.0) * (1.0 - smoothstep(0.0, 5.0, d.y))
                       + (1.0 - smoothstep(0.0, 1.2, d.y)) * (1.0 - smoothstep(0.0, 5.0, d.x));
            star += 1.0 - smoothstep(0.0, 2.2, length(d));
            float vis = mix(uGlint.w, uGlint.z, uDay);
            light += uGlintCol * star * tw * vis;
        }
    }

    // Motes: things that glow and float (fireflies, embers, wisps, dust in a lamp's beam), one per lucky cell, rising.
    if (uMote.y > 0.0) {
        float vis = mix(uMoteVis.y, uMoteVis.x, uDay);
        for (int k = 0; k < 2; k++) {
            float fk = float(k);
            vec2 g = (p + vec2(0.0, uTime * uMote.z * (1.0 + fk * 0.6))) / uMote.x + fk * 19.0;
            vec2 id = floor(g), f = fract(g);
            float h = hash(id);
            if (h < uMote.y) {
                float ph = hash(id + 5.0) * 6.283;
                vec2 at = vec2(0.5) + 0.3 * vec2(sin(uTime * 0.7 + ph), cos(uTime * 0.53 + ph * 1.7));
                float life = 0.5 + 0.5 * sin(uTime * (0.3 + hash(id + 9.0) * 0.5) + ph);
                float d = length((f - at) * uMote.x);
                float m = (1.0 - smoothstep(0.0, uMote.w, d)) + 0.35 * (1.0 - smoothstep(0.0, uMote.w * 3.5, d));
                light += uMoteCol * m * life * life * vis;
            }
        }
    }

    // The breathing land: slow patches of glow that swell and fade (embers under the ash, the Ether's light).
    if (uPulse.x > 0.0) {
        float a = fbm(p / uPulse.y + vec2(uTime * uPulse.z * 0.05, 0.0));
        float beat = 0.5 + 0.5 * sin(uTime * uPulse.z + a * 9.0);
        light += uPulseCol * smoothstep(0.55, 0.8, a) * beat * uPulse.x;
    }

    shade = clamp(shade, 0.0, 0.75);
    gl_FragColor = vec4(uShade * uAmb * shade + light, shade);
}
