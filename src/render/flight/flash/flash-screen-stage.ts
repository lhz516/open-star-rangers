/**
 * The screen flash's screen stage (docs/plan/p3/12/spec.md, 爆炸精灵与屏幕闪光, 画面合成与 P3-13 接口, 技术决定 4;
 * docs/original/formats/executable.md, SF4; AC-14, AC-16): replaces the composition's copy of the game image onto the
 * canvas (`FlightRunRender.setScreen`) with the flash's two effects on the whole 4:3 picture, cockpit and HUD included.
 *
 * - **Palette:** the original writes table k of the palette snapshot to the DAC, entry = min(P6 + 2k, 63) per 6-bit
 *   component, and every pixel shows its index through it. Every colour of the game image is a palette colour expanded
 *   as e(v) = (v << 2) | (v >> 4), from which v = c >> 2, so the stage maps each component c to e(min((c >> 2) + 2k, 63));
 *   table 0 copies the image unchanged.
 * - **Offset:** the picture moves up `shiftRows` logical rows, rounded to whole device pixels at the layout's scale;
 *   the rows it reveals at the bottom show black, the base colour, through the same table, as the original's index 0.
 *
 * The canvas is the 4:3 picture: the black borders around it and the React controls are outside it and never change.
 */
import { BufferAttribute, BufferGeometry, Mesh, Scene, ShaderMaterial, type Texture } from 'three';
import type { FlightScreen, LayerPass, CompositionFrame } from '../composition/flight-layers.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import type { ScreenFlashes } from './screen-flash.ts';

/** What the stage allocates: one full-screen triangle and its material. */
export const FLASH_SCREEN_GPU_PLAN: FlightGpuPlan = Object.freeze({ texels: 0, vertices: 3, indices: 0, renderTargets: 0 });

const GEOMETRY = 'flash:screen-geometry';
const MATERIAL = 'flash:screen-material';

const VERTEX = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Device rows count up from the bottom, so the image row shown at row y is y − shift.
const FRAGMENT = `
uniform sampler2D image;
uniform int shift;
uniform float add;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy) - ivec2(0, shift);
  vec3 colour = at.y >= 0 ? texelFetch(image, at, 0).rgb : vec3(0.0);
  if (add > 0.0) {
    vec3 v = min(floor(floor(colour * 255.0 + 0.5) / 4.0) + add, 63.0);
    colour = (v * 4.0 + floor(v / 16.0)) / 255.0;
  }
  gl_FragColor = vec4(colour, 1.0);
}`;

/** The device rows a shift of `rows` logical rows moves the picture by. */
export const deviceShift = (rows: number, scale: number): number => Math.round(rows * scale);

/** What the fragment shader shows for an 8-bit component of the game image under `table`. */
export function flashedComponent(component: number, table: number): number {
  if (table === 0) return component;
  const v = Math.min((component >> 2) + 2 * table, 63);
  return (v << 2) | (v >> 4);
}

export interface FlashScreenStageInput {
  /** The run's GPU cache (`FlightRunRender.resources`). */
  readonly resources: FlightGpuCache;
  /** The flash state the stage shows, read at each frame. */
  readonly flash: Pick<ScreenFlashes, 'screen'>;
}

export class FlashScreenStage implements FlightScreen {
  readonly #resources: FlightGpuCache;
  readonly #flash: Pick<ScreenFlashes, 'screen'>;
  readonly #scene = new Scene();
  #material: ShaderMaterial | null = null;

  constructor({ resources, flash }: FlashScreenStageInput) {
    this.#resources = resources;
    this.#flash = flash;
  }

  passes(frame: CompositionFrame, image: Texture): readonly LayerPass[] {
    const material = this.#material ?? this.#build();
    const { table, shiftRows } = this.#flash.screen();
    material.uniforms.image.value = image;
    material.uniforms.shift.value = deviceShift(shiftRows, frame.logical.scale);
    material.uniforms.add.value = 2 * table;
    return [{ scene: this.#scene, camera: frame.logicalCamera }];
  }

  #build(): ShaderMaterial {
    const geometry = this.#resources.geometry(GEOMETRY, { vertices: 3, indices: 0 }, () =>
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
    const material = this.#resources.material(MATERIAL, () => new ShaderMaterial({
      name: 'flight-screen-flash', uniforms: { image: { value: null }, shift: { value: 0 }, add: { value: 0 } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false,
    })) as ShaderMaterial;
    const mesh = new Mesh(geometry, material);
    mesh.name = 'flight-screen-flash';
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
    this.#material = material;
    return material;
  }
}
