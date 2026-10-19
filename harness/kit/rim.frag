// The plain rim: replaces Phaser's `applyLighting` (the ApplyLighting shader addition) in the lit batch shaders: the usual lit colour, plus a
// coloured edge on the side of a surface that faces a light. uRimStrength is set by rim.ts.
// Used until some art has a material (material.frag then takes over): Phaser's own light loop plus a second loop only on edge pixels, about +0 to +1.6 ms per 6 screens of lit fill on the pane against +2.6 to +4 for material.frag.
// Needs normals tilted at the silhouette (the kit's automatic normal maps); a flat normal has no edge, so no rim.
uniform float uRimStrength;

vec4 applyLighting (vec4 fragColor, vec3 normal)
{
    vec4 lighting = getLighting(fragColor, normal);
    vec4 lit = fragColor * vec4(lighting.rgb * lighting.a, lighting.a);
    float tilt = length(normal.xy);
    if (tilt > 0.02)
    {
        vec2 res = vec2(min(uResolution.x, uResolution.y)) * uCamera.w;
        vec2 edge = normal.xy / tilt;
        vec3 rim = vec3(0.0);
        for (int index = 0; index < kMaxLights; ++index)
        {
            if (index < uLightCount)
            {
                Light light = uLights[index];
                vec2 toLight = (light.position.xy - gl_FragCoord.xy) / res;
                float d = length(toLight);
                float radius = (light.radius / res.x * uCamera.w) * uCamera.w;
                float attenuation = clamp(1.0 - d * d / (radius * radius), 0.0, 1.0);
                float facing = max(dot(edge, toLight / max(d, 0.00001)), 0.0);
                rim += light.color * (light.intensity * attenuation * facing);
            }
        }
        // a subtle edge (0.3 of the strength), tinted toward the art's colour so unmarked art does not read as metal; matches material.frag at gloss 0
        vec3 albedo = fragColor.rgb / max(fragColor.a, 0.0001);
        lit.rgb += rim * (uRimStrength * 0.3 * tilt) * mix(albedo, vec3(1.0), 0.25) * fragColor.a;
    }
    return lit;
}
