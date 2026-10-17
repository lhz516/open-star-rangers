/**
 * The layers of a flight frame (docs/plan/p3/12/spec.md, 画面合成与 P3-13 接口; docs/original/formats/executable.md, FC2,
 * FC3, FC5, RS6; AC-16). Every layer draws into one game image, the logical screen at the drawing buffer's size, in the
 * order the original's frame render calls its routines for the view; a screen stage then puts that image on the canvas,
 * where the screen flash (P3-12/21) changes the whole 4:3 picture, cockpit and HUD included, but not the page around
 * it. The persistent frame buffer and per-layer erases of the original show what a full redraw over index 0 in this
 * order shows (FC3, Likely), so each frame starts from a black game image.
 *
 * - **Views 0xC and 0x11/8:** nebula, star field, speed dust (pixels), the 3D world (depth-tested), explosion sprites,
 *   then the cockpit slot: the view label, cockpit and HUD that P3-13 draws. Only these views clear the world's depth.
 * - **View 1 (Warp):** star field, the 3D world, speed dust (lines, after the world), the Warp effect, cockpit. The
 *   world's depth is not cleared in Warp (RS6): it keeps the depth of the last frame that cleared it, through any map or
 *   base frame between.
 * - **Views 6, 8 and 0x13:** no world, only the cockpit slot (the map is P3-13's, the base screens P3-10's).
 *
 * Among the 2D layers only explosion sprites read depth and none writes it (FC5): layers drawn before the world must not
 * write depth. The game image's depth is a texture (`CompositionFrame.depth`), so the sprites can test each block at
 * one pixel as the original does (FC8). A slot may hold several layers, drawn in the order they were added.
 */
import type { Camera, DepthTexture, Scene, Texture, WebGLRenderTarget } from 'three';
import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { FlightSceneFrame, FlightViewKind } from '../scene/flight-scene.ts';
import type { LogicalRect, LogicalTransform } from './logical-screen.ts';

export const FLIGHT_LAYER_SLOTS = Object.freeze(['nebula', 'stars', 'dust', 'world', 'sprites', 'warp-effect', 'cockpit'] as const);

export type FlightLayerSlot = typeof FLIGHT_LAYER_SLOTS[number];

const WORLD_VIEW_ORDER: readonly FlightLayerSlot[] = Object.freeze(['nebula', 'stars', 'dust', 'world', 'sprites', 'cockpit']);

/** The slots each view draws, in drawing order (FC2). */
export const LAYER_ORDER: Readonly<Record<FlightViewKind, readonly FlightLayerSlot[]>> = Object.freeze({
  flight: WORLD_VIEW_ORDER,
  destruction: WORLD_VIEW_ORDER,
  warp: Object.freeze(['stars', 'world', 'dust', 'warp-effect', 'cockpit'] as const),
  'no-world': Object.freeze(['cockpit'] as const),
});

/** The world of a frame: the scene, its Three.js camera and the viewport the world is drawn in. */
export interface WorldView {
  readonly scene: FlightSceneFrame;
  /** Camera space to the game image (logical-screen.ts); for the world slot's passes. */
  readonly camera: Camera;
  /** The world viewport; the world slot's passes are limited to it. */
  readonly viewport: LogicalRect;
}

/** What every layer reads of a frame; the P3-13 interface included. Nothing in it may be changed. */
export interface CompositionFrame {
  readonly logical: LogicalTransform;
  readonly viewMode: number;
  readonly subMode: number;
  readonly view: FlightViewKind;
  /** The Runtime's two Render States and alpha; `render.current` is the current Render State. */
  readonly render: RenderFrame;
  /** The latest projection, as the session frame gave it. */
  readonly projection: Projection;
  /** Null in views that draw no world. */
  readonly world: WorldView | null;
  /** Draws logical pixels (x, y) into the game image, z passed through as normalised depth (logical-screen.ts). */
  readonly logicalCamera: Camera;
  /**
   * The game image's depth, the world's once the world slot has drawn, with the device pixels' rows bottom up. A pass
   * may sample it only while it draws into a target of its own: the game image's target holds it.
   */
  readonly depth: DepthTexture;
}

/** One pass a layer draws. */
export interface LayerPass {
  readonly scene: Scene;
  readonly camera: Camera;
  /** Defaults to the game image for a layer, and to the canvas for the screen stage. */
  readonly target?: WebGLRenderTarget | null;
  /** Clear the whole target first; a layer clears only targets of its own. */
  readonly clearColor?: boolean;
  readonly clearDepth?: boolean;
  /** Limits the drawing to this logical rectangle; the world slot's passes default to the world viewport. */
  readonly scissor?: LogicalRect | null;
}

export interface FlightLayer {
  readonly slot: FlightLayerSlot;
  /** This frame's passes, called only in the views whose order holds the slot. */
  passes(frame: CompositionFrame): readonly LayerPass[];
}

/** Puts the game image on the canvas, which the composition has cleared to black; the default copies it unchanged. */
export interface FlightScreen {
  passes(frame: CompositionFrame, image: Texture): readonly LayerPass[];
}
