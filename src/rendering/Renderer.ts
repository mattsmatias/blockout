import * as THREE from 'three';
import { RENDER } from '../core/Config';
import type { RenderInfo } from '../core/Diagnostics';
import { artResolution, pickZoom } from './CameraRig';

/**
 * Pixel-perfect renderer.
 *
 * The scene is drawn into a low-resolution "art pixel" render target, then
 * upscaled to the canvas by an exact integer factor with nearest sampling.
 * This guarantees uniform pixel size, crisp edges and no blur at any DPR.
 *
 * Contains no game rules: it draws whatever scene + camera it is given.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private target: THREE.WebGLRenderTarget;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blitMaterial: THREE.ShaderMaterial;
  private readonly blitQuad: THREE.Mesh;

  deviceWidth = 1;
  deviceHeight = 1;
  zoom = 2;
  zoomOverride: number | null = null;
  artWidth = 2;
  artHeight = 2;
  readonly info: RenderInfo = { drawCalls: 0, triangles: 0, textures: 0, geometries: 0 };

  constructor(container: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1); // we manage device pixels ourselves
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.setClearColor(RENDER.CLEAR_COLOR, 1);
    this.gl.info.autoReset = false;
    this.canvas = this.gl.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.target = this.createTarget(2, 2);
    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tArt: { value: this.target.texture },
        uvScale: { value: new THREE.Vector2(1, 1) },
        uvOffset: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec2 uvScale;
        uniform vec2 uvOffset;
        void main() {
          vUv = uv * uvScale + uvOffset;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tArt;
        void main() {
          gl_FragColor = texture2D(tArt, vUv);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial);
    this.blitQuad.frustumCulled = false;
    this.blitScene.add(this.blitQuad);
  }

  private createTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      colorSpace: THREE.SRGBColorSpace,
    });
    t.texture.name = 'ArtPixelTarget';
    return t;
  }

  /** Recomputes all sizes from the container's CSS size and DPR. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const ratio = Math.min(dpr || 1, RENDER.MAX_DEVICE_PIXEL_RATIO);
    this.deviceWidth = Math.max(1, Math.round(cssWidth * ratio));
    this.deviceHeight = Math.max(1, Math.round(cssHeight * ratio));
    this.gl.setSize(this.deviceWidth, this.deviceHeight, false);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    this.zoom =
      this.zoomOverride ??
      pickZoom(this.deviceWidth, this.deviceHeight, RENDER.ZOOM_LEVELS, RENDER.MIN_ART_PIXELS_SHORT_SIDE);
    const art = artResolution(this.deviceWidth, this.deviceHeight, this.zoom);
    if (art.w !== this.artWidth || art.h !== this.artHeight) {
      this.target.dispose();
      this.target = this.createTarget(art.w, art.h);
      this.blitMaterial.uniforms.tArt!.value = this.target.texture;
      this.artWidth = art.w;
      this.artHeight = art.h;
    }
    // Show exactly deviceW/zoom art pixels, centred in the (even-sized) target.
    const visW = this.deviceWidth / this.zoom;
    const visH = this.deviceHeight / this.zoom;
    (this.blitMaterial.uniforms.uvScale!.value as THREE.Vector2).set(visW / art.w, visH / art.h);
    (this.blitMaterial.uniforms.uvOffset!.value as THREE.Vector2).set((art.w - visW) / 2 / art.w, (art.h - visH) / 2 / art.h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.gl.info.reset();
    this.gl.setRenderTarget(this.target);
    this.gl.clear();
    this.gl.render(scene, camera);
    const i = this.gl.info;
    this.info.drawCalls = i.render.calls;
    this.info.triangles = i.render.triangles;
    this.gl.setRenderTarget(null);
    this.gl.render(this.blitScene, this.blitCamera);
    this.info.textures = i.memory.textures;
    this.info.geometries = i.memory.geometries;
  }

  dispose(): void {
    this.target.dispose();
    this.blitMaterial.dispose();
    this.blitQuad.geometry.dispose();
    this.gl.dispose();
    this.canvas.remove();
  }
}
