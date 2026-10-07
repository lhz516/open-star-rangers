/**
 * A recording RenderSurface for Node tests. It stores what each draw showed, emulates the WebGL
 * renderer's geometry/texture/program counters from what was drawn and disposed, and fails on request.
 */
import { Mesh, Texture, type Camera, type Material, type BufferGeometry, type Scene } from 'three';
import type { ViewportLayout } from '../viewport/viewport-layout.ts';
import type { RenderGpuStats, RenderSurface, RenderSurfaceEvents, RenderSurfaceSize } from './render-surface.ts';

export interface DrawnObject {
  readonly mesh: Mesh;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

export interface DrawRecord {
  readonly objects: readonly DrawnObject[];
  readonly camera: Camera;
  readonly projection: readonly number[];
}

export class RecordingSurface implements RenderSurface {
  maxDrawingBufferSize = 4096;
  events: RenderSurfaceEvents | null = null;
  /** Port calls in order. */
  readonly calls: string[] = [];
  readonly draws: DrawRecord[] = [];
  readonly layouts: (ViewportLayout | null)[] = [];
  /** Thrown by the draw whose zero-based index equals `drawFailureAt`. */
  drawFailure: unknown;
  drawFailureAt = 0;
  connectFailure: unknown;
  layoutFailure: unknown;
  disconnectFailure: unknown;
  disposeFailure: unknown;
  readonly #geometries = new Set<BufferGeometry>();
  readonly #textures = new Set<Texture>();
  readonly #programs = new Set<Material>();
  #drawAttempts = 0;

  connect(events: RenderSurfaceEvents): void {
    this.calls.push('connect');
    if (this.connectFailure !== undefined) throw this.connectFailure;
    this.events = events;
  }

  setLayout(layout: ViewportLayout | null): void {
    this.calls.push('layout');
    if (this.layoutFailure !== undefined) throw this.layoutFailure;
    this.layouts.push(layout);
  }

  draw(scene: Scene, camera: Camera): void {
    this.calls.push('draw');
    if (this.drawFailure !== undefined && this.#drawAttempts++ === this.drawFailureAt) throw this.drawFailure;
    const objects: DrawnObject[] = [];
    // Like the WebGL renderer, only visible objects are drawn and uploaded.
    scene.traverseVisible(mesh => {
      if (!(mesh instanceof Mesh)) return;
      const material = mesh.material as Material;
      this.#upload(mesh.geometry, material);
      objects.push(Object.freeze({
        mesh, name: mesh.name, position: mesh.position.toArray() as [number, number, number], geometry: mesh.geometry, material,
      }));
    });
    this.draws.push(Object.freeze({ objects, camera, projection: [...camera.projectionMatrix.elements] }));
  }

  gpuStats(): RenderGpuStats {
    return { geometries: this.#geometries.size, textures: this.#textures.size, programs: this.#programs.size };
  }

  disconnect(): void {
    this.calls.push('disconnect');
    this.events = null;
    if (this.disconnectFailure !== undefined) throw this.disconnectFailure;
  }

  dispose(): void {
    this.calls.push('dispose');
    if (this.disposeFailure !== undefined) throw this.disposeFailure;
  }

  /** Delivers a size the way the browser surface's observers would. */
  resize(width = 640, height = 480, devicePixelRatio = 1): void {
    const size: RenderSurfaceSize = { width, height, devicePixelRatio };
    this.events?.resize(size);
  }

  get lastDraw(): DrawRecord | undefined {
    return this.draws.at(-1);
  }

  #upload(geometry: BufferGeometry, material: Material): void {
    if (!this.#geometries.has(geometry)) {
      this.#geometries.add(geometry);
      geometry.addEventListener('dispose', () => { this.#geometries.delete(geometry); });
    }
    if (!this.#programs.has(material)) {
      this.#programs.add(material);
      material.addEventListener('dispose', () => { this.#programs.delete(material); });
    }
    for (const texture of Object.values(material)) {
      if (!(texture instanceof Texture) || this.#textures.has(texture)) continue;
      this.#textures.add(texture);
      texture.addEventListener('dispose', () => { this.#textures.delete(texture); });
    }
  }
}
