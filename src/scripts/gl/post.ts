/* Optional desktop post chain: subtle bloom + chromatic aberration / vignette / grain. Lazy-loaded. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { finalPassShader } from './shaders';

export interface Post {
  render(time: number): void;
  setSize(w: number, h: number, dpr: number): void;
  dispose(): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // bloom runs at half resolution (UnrealBloomPass halves internally per mip)
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.12, 0.55);
  composer.addPass(bloom);
  const fin = new ShaderPass(finalPassShader);
  fin.uniforms.uInk.value = new THREE.Color(0x050507); // converted to linear by three's colour management
  const prevClear = new THREE.Color();
  composer.addPass(fin);
  composer.addPass(new OutputPass());
  return {
    render(time) {
      fin.uniforms.uTime.value = time;
      // clear to pure black (colour-space neutral); the ink background is added back in linear space in `fin`
      renderer.getClearColor(prevClear);
      renderer.setClearColor(0x000000, 1);
      composer.render();
      renderer.setClearColor(prevClear, 1);
    },
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
    },
  };
}
