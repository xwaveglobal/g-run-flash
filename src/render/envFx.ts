import * as THREE from 'three';

/** Wrap a scrolling object into [near - range, near): it re-enters at the far end (near − range). */
export const wrapZ = (base: number, dist: number, range: number, near: number) => {
  const z = (((base + dist) % range) + range) % range; // 0..range
  return near - range + z;
};

/**
 * v4.2 far fade for recycled scenery (no popping). Scrolling props are repositioned by modulo and
 * re-enter at the far end of their range (their spawn z). This blends a material into the fog colour
 * over the last `len` metres before the spawn point, so a prop that wraps around appears out of the
 * haze instead of popping in — whatever the world's own fog distance is.
 *
 * Works with instanced and plain meshes; chains with an existing onBeforeCompile. Only for opaque
 * (normal-blended) materials: additive glows simply fade with the same factor.
 */
export function addFarFade(mat: THREE.Material, spawnZ: number, len = 45) {
  if (mat.userData.farFade) {
    // shared material used by several layers: keep the nearest spawn (the most conservative)
    const u = mat.userData.farFade as { from: { value: number }; to: { value: number } };
    const to = -spawnZ - 4;
    if (to < u.to.value) {
      u.to.value = to;
      u.from.value = to - len;
    }
    return;
  }
  const uniforms = { from: { value: -spawnZ - 4 - len }, to: { value: -spawnZ - 4 } };
  mat.userData.farFade = uniforms;
  const additive = (mat as THREE.Material & { blending: number }).blending === THREE.AdditiveBlending;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uFarFrom = uniforms.from;
    sh.uniforms.uFarTo = uniforms.to;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFarZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 ffw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            ffw = instanceMatrix * ffw;
          #endif
          vFarZ = (modelMatrix * ffw).z;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFarZ;\nuniform float uFarFrom;\nuniform float uFarTo;')
      .replace(
        '#include <fog_fragment>',
        additive
          ? '#include <fog_fragment>\ngl_FragColor.rgb *= 1.0 - smoothstep(uFarFrom, uFarTo, -vFarZ);'
          : `#include <fog_fragment>
          #ifdef USE_FOG
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uFarFrom, uFarTo, -vFarZ));
          #endif`,
      );
  };
  // the program key must tell apart materials whose earlier onBeforeCompile differs
  const prevSrc = prev.toString();
  mat.customProgramCacheKey = () => 'farfade|' + (additive ? 'a|' : 'n|') + prevSrc;
  mat.needsUpdate = true;
}

/** fade factor at world z for a layer that re-enters at spawnZ (mirror of the shader, for tests) */
export function farFadeAt(z: number, spawnZ: number, len = 45) {
  const from = -spawnZ - 4 - len;
  const to = -spawnZ - 4;
  const t = Math.min(1, Math.max(0, (-z - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
