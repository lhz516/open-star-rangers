/**
 * The production map input's readiness (P3-13 spec, 地图输入几何与指针 “就绪” and DC-09 “ready 凭证”; P3-05's P3-13
 * sync “绘制 ready”): the credential of the map picture the composition actually submitted. `cursor` stands in for the
 * map input's cursor drawer, but its `draw` draws, submits and advances nothing: it reports whether the latest
 * submitted picture (`MapPictureModule.drawn()`, which includes the original pointer) is of the geometry the input
 * reads now. The picture is drawn whatever the input's qualification, so its first draw never waits for input.
 *
 * One port per run, so the owner and run are fixed by construction. The composition calls `submitted` after each
 * actual submission with that frame's `drawn()` (null included), `revoke` once the layout, the device or the canvas
 * binding is lost or a submission failed, and `dispose` with the run. After a loss the next submitted picture grants
 * readiness again, and the map input asks for Pointer Lock by its own rules.
 */
import type { MapPictureDrawn } from '../cockpit/map-picture/map-picture.ts';
import type { MapCursorDrawer } from './map-cursor.ts';
import { checkMapInputGeometry, sameLogicalGeometry, type MapInputGeometryPort } from './map-input-geometry.ts';

export interface MapPresentationOptions {
  /** The map input's geometry port: the credential holds only while its screen and main map are the picture's. */
  readonly geometry: MapInputGeometryPort;
  /**
   * Called after `revoke` ended a credential, such as `GameInputConsumer.syncMap`, so that the input drops its held
   * buttons and exits its Pointer Lock at once.
   */
  readonly revoked?: () => void;
}

export interface MapPresentationPort {
  /** `MapInputOptions.cursor`'s production value. */
  readonly cursor: Pick<MapCursorDrawer, 'draw' | 'ready'>;
  /** After a frame was actually submitted: the map picture it showed, `drawn()` of the run's map picture module. */
  submitted(picture: MapPictureDrawn | null): void;
  /** The layout, the device or the canvas binding was lost, or a submission failed: the credential ends now. */
  revoke(): void;
  /** With the run: nothing grants readiness afterwards, and late submissions are ignored. */
  dispose(): void;
}

class Port implements MapPresentationPort {
  readonly #options: MapPresentationOptions;
  #credential: MapPictureDrawn | null = null;
  /** The latest `draw` found the credential of the current geometry. */
  #current = false;
  #disposed = false;

  readonly cursor: Pick<MapCursorDrawer, 'draw' | 'ready'>;

  constructor(options: MapPresentationOptions) {
    this.#options = options;
    const ready = (): boolean => this.#credential !== null && this.#current;
    this.cursor = Object.freeze({
      draw: () => this.#draw(),
      get ready() { return ready(); },
    });
  }

  submitted(picture: MapPictureDrawn | null): void {
    if (!this.#disposed) this.#credential = picture;
  }

  revoke(): void {
    const had = this.#credential !== null;
    this.#credential = null;
    this.#current = false;
    if (had) this.#options.revoked?.();
  }

  dispose(): void {
    this.#disposed = true;
    this.#credential = null;
    this.#current = false;
  }

  #draw(): boolean {
    this.#current = this.#credential !== null && this.#of(this.#credential);
    return this.#current;
  }

  /** The map input reports an invalid geometry itself; here it only withholds the credential. */
  #of(picture: MapPictureDrawn): boolean {
    try {
      const geometry = checkMapInputGeometry(this.#options.geometry.read());
      return geometry !== null && sameLogicalGeometry(picture.geometry, geometry);
    } catch {
      return false;
    }
  }
}

export function createMapPresentationPort(options: MapPresentationOptions): MapPresentationPort {
  return new Port(options);
}
