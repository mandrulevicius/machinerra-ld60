// Replaces Phaser's `applyLighting` (the ApplyLighting shader addition) in the lit batch shaders: Phaser's own diffuse loop (copied,
// with cones and self-shadow), plus a specular highlight and a coloured rim on the side that faces a light, in a second loop that
// only the pixels that have a gloss or sit on an edge run (a single loop with all three cost +7 ms per 6 screens on the pane).
// The material (rim.ts feeds it from the normal map's alpha, and on high quality from the ORM + emissive texture) shapes them:
//   gloss   0..1  specular strength and tightness; rim sharpness (pow of the edge tilt) and brightness. Metal: tight and bright;
//                 below ~0.2 (wood, stone, cloth, skin) there is no visible specular and the rim is a faint, wide glow in the art's colour.
//   metal   0..1  tints specular and rim with the art's colour instead of the light's
//   ao      0..1  1 = no occlusion; scales the diffuse light
//   emi     0..1  glows at its own colour whatever the lights do
// Gloss 0 with no emissive is exactly the plain rim (rim.frag): the lit colour plus 0.3 * uRimStrength * tilt on lit silhouette edges,
// tinted toward the art's colour (a light that scatters, so it reads as matte). The rim grows with gloss squared, and only glossy
// non-metal (paint, lacquer) shifts toward the light's own colour; metal is bright and thin whatever its colour.
// Needs normals tilted at the silhouette (the kit's automatic normal maps); a flat normal has no edge, so no rim.
// Written against Phaser 4.2.1's DefineLights header (struct Light, kMaxLights, uLights, uCamera, uAmbientLightColor) and
// getLighting: if Phaser changes those, this must follow.
uniform float uRimStrength;
uniform float uMatRim; // 1: the rim follows the material, 0: the plain rim for every material
#ifdef MAT_ORM
uniform sampler2D uMatSampler;
#endif

vec4 applyLightingMat (vec4 fragColor, vec3 normal, float gloss, float metal, float ao, float emi)
{
    vec2 res = vec2(min(uResolution.x, uResolution.y)) * uCamera.w;
    float tilt = length(normal.xy);
    vec2 edge = normal.xy / max(tilt, 0.00001);
    bool doRim = uRimStrength > 0.0 && tilt > 0.02;
    bool doSpec = gloss > 0.02;
    float specPow = mix(8.0, 260.0, gloss * gloss);
    #ifdef FEATURE_SELFSHADOW
    vec3 unpremultipliedColor = fragColor.rgb / fragColor.a;
    float occlusionThreshold = 1.0 - ((unpremultipliedColor.r + unpremultipliedColor.g + unpremultipliedColor.b) / uDiffuseFlatThreshold);
    #endif
    vec3 diffuse = vec3(0.0);
    for (int index = 0; index < kMaxLights; ++index)
    {
        if (index < uLightCount)
        {
            Light light = uLights[index];
            vec3 lightDir = vec3((light.position.xy / res) - (gl_FragCoord.xy / res), light.position.z / res.x);
            vec3 lightNormal = normalize(lightDir);
            float distToSurf = length(lightDir) * uCamera.w;
            float diffuseFactor = max(dot(normal, lightNormal), 0.0);
            float radius = (light.radius / res.x * uCamera.w) * uCamera.w;
            float attenuation = clamp(1.0 - distToSurf * distToSurf / (radius * radius), 0.0, 1.0);
            if (light.cone.z > 0.5)
            {
                vec2 coneVector = gl_FragCoord.xy - light.position.xy;
                float coneLength = length(coneVector);
                vec2 lightToFrag = coneLength > 0.0 ? coneVector / coneLength : light.direction;
                float coneDot = dot(lightToFrag, light.direction);
                float coneRange = abs(light.cone.y - light.cone.x);
                float coneAttenuation = coneRange < 0.0001 ? step(light.cone.y, coneDot) : smoothstep(light.cone.x, light.cone.y, coneDot);
                attenuation *= coneAttenuation;
            }
            #ifdef FEATURE_SELFSHADOW
            float occluded = smoothstep(0.0, 1.0, (diffuseFactor - occlusionThreshold) / uPenumbra);
            diffuse += light.color * (attenuation * light.intensity) * diffuseFactor * occluded;
            #else
            diffuse += light.color * (attenuation * light.intensity) * diffuseFactor;
            #endif
        }
    }
    // Specular and rim in their own loop, run only where the material or the edge asks for them: most pixels skip it.
    vec3 spec = vec3(0.0);
    vec3 rim = vec3(0.0);
    if (doSpec || doRim)
    {
        for (int index = 0; index < kMaxLights; ++index)
        {
            if (index < uLightCount)
            {
                Light light = uLights[index];
                vec3 lightDir = vec3((light.position.xy / res) - (gl_FragCoord.xy / res), light.position.z / res.x);
                float distToSurf = length(lightDir) * uCamera.w;
                float radius = (light.radius / res.x * uCamera.w) * uCamera.w;
                float attenuation = clamp(1.0 - distToSurf * distToSurf / (radius * radius), 0.0, 1.0);
                if (light.cone.z > 0.5)
                {
                    vec2 coneVector = gl_FragCoord.xy - light.position.xy;
                    float coneLength = length(coneVector);
                    vec2 lightToFrag = coneLength > 0.0 ? coneVector / coneLength : light.direction;
                    float coneDot = dot(lightToFrag, light.direction);
                    float coneRange = abs(light.cone.y - light.cone.x);
                    attenuation *= coneRange < 0.0001 ? step(light.cone.y, coneDot) : smoothstep(light.cone.x, light.cone.y, coneDot);
                }
                if (doSpec)
                {
                    vec3 halfway = normalize(normalize(lightDir) + vec3(0.0, 0.0, 1.0));
                    spec += light.color * (attenuation * light.intensity) * pow(max(dot(normal, halfway), 0.0), specPow);
                }
                if (doRim)
                {
                    vec2 toLight = (light.position.xy - gl_FragCoord.xy) / res;
                    float d = length(toLight);
                    float att2 = clamp(1.0 - d * d / (radius * radius), 0.0, 1.0);
                    float facing = max(dot(edge, toLight / max(d, 0.00001)), 0.0);
                    rim += light.color * (light.intensity * att2 * facing);
                }
            }
        }
    }
    vec3 albedo = fragColor.rgb / max(fragColor.a, 0.0001);
    vec3 tint = mix(vec3(1.0), albedo, metal);
    vec3 fuzz = mix(albedo, vec3(1.0), 0.25);
    vec3 col = fragColor.rgb * (uAmbientLightColor + diffuse) * ao;
    col += spec * (gloss * gloss * (0.4 + 0.4 * metal) * 1.2) * tint * (ao * fragColor.a);
    if (doRim)
    {
        float rimPow = mix(1.0, 1.0 + 3.0 * gloss, uMatRim);
        float rimGain = mix(0.3, 0.3 + 3.6 * gloss * gloss + 0.8 * metal, uMatRim);
        float sheen = clamp((gloss - 0.25) / 0.45, 0.0, 1.0);
        vec3 rimTint = mix(fuzz, mix(mix(fuzz, vec3(1.0), sheen), albedo, metal * 0.6), uMatRim);
        col += rim * (uRimStrength * rimGain * pow(tilt, rimPow)) * rimTint * fragColor.a;
    }
    col = mix(col, fragColor.rgb, emi);
    return vec4(col, fragColor.a);
}
