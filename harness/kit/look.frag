#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uTexel;       // 1 / camera size in px
uniform float uBloom;      // 0 = off
uniform float uThreshold;
uniform float uRadius;     // px
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
uniform float uVignette;
uniform float uScan;       // scanline strength, 0 = off
uniform float uHeight;     // px, for scanlines

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)

// Cheap bloom in the same pass: 12 taps on two rings, bright parts only.
vec3 bright(vec2 off)
{
    vec3 s = texture2D(uMainSampler, outTexCoord + off * uTexel).rgb;
    return max(s - uThreshold, 0.0);
}

void main ()
{
    vec4 src = texture2D(uMainSampler, outTexCoord);
    vec3 c = src.rgb;
    if (uBloom > 0.0)
    {
        float r = uRadius;
        float h = uRadius * 0.5;
        vec3 acc = bright(vec2(r, 0.0)) + bright(vec2(-r, 0.0)) + bright(vec2(0.0, r)) + bright(vec2(0.0, -r))
            + bright(vec2(0.7071 * r, 0.7071 * r)) + bright(vec2(-0.7071 * r, 0.7071 * r))
            + bright(vec2(0.7071 * r, -0.7071 * r)) + bright(vec2(-0.7071 * r, -0.7071 * r))
            + bright(vec2(h, h)) + bright(vec2(-h, h)) + bright(vec2(h, -h)) + bright(vec2(-h, -h));
        c += acc * (uBloom / 12.0);
    }
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSaturation);
    c = (c - 0.5) * uContrast + 0.5;
    c *= uTint;
    if (uScan > 0.0)
    {
        c *= 1.0 - uScan * (0.5 + 0.5 * sin(outTexCoord.y * uHeight * 3.14159));
    }
    vec2 d = outTexCoord - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.25, 0.75, length(d));
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
