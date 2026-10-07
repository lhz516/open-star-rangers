import { expect, type Page } from '@playwright/test';
import { Raycaster, Vector2, type MeshBasicMaterial, type Object3D } from 'three';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import { resolveEntry, viewerCatalog, type ResolvedEntry, type ViewerEntry } from '../../src/app/viewer/viewer-items.ts';
import type { ExpandedImage } from '../../src/content/graphics/expand-image.ts';
import { RecordingSurface } from '../../src/render/scene/render-surface.test-support.ts';
import type { ViewportLayout } from '../../src/render/viewport/viewport-layout.ts';
import { CHECKER_GREYS, CHECKER_SQUARE } from '../../src/render/viewer/viewer-presentation.ts';
import { glyphSheet, paletteSheet, type PicturePlacement } from '../../src/render/viewer/viewer-pictures.ts';
import { createViewerRenderer, type ViewerItem } from '../../src/render/viewer/viewer-renderer.ts';
import type { ViewerView } from '../../src/render/viewer/viewer-view.ts';
import { createImportJob } from '../../src/workers/import-job.ts';
import { scenarioOpen, sliceCoveredFiles, syntheticImport } from '../../src/workers/synthetic-import.test-support.ts';
import { button, importFiles, type FilePayload, type TestEntryOptions } from './app-entry.ts';

// P2-11 subtask 11: the viewer page on the development test entry, with the synthetic `models` scenario. Expected
// pixels come from the same package, converted here in Node by the same job, and the viewer's own render modules.

let models: Promise<readonly HeldGroup[]> | undefined;
/** The groups the `models` scenario sends, converted in Node by the production job on the same synthetic disc. */
export function modelsPackage(): Promise<readonly HeldGroup[]> {
  return models ??= (async () => {
    const { files } = await syntheticImport(sliceCoveredFiles());
    const groups: HeldGroup[] = [];
    await createImportJob(scenarioOpen('models'))(files.map(file => ({ name: file.name, blob: file })), {
      progress: () => undefined,
      identified: () => undefined,
      group: (group, input) => { groups.push(Object.freeze({ group, ...input })); },
    });
    return Object.freeze(groups);
  })();
}

export interface ResolvedViewerEntry {
  readonly entry: ViewerEntry;
  readonly resolved: ResolvedEntry;
}

let resolved: Promise<readonly ResolvedViewerEntry[]> | undefined;
/** Every entry of the `models` package, resolved, in catalog order; computed once per worker process. */
export function modelsEntries(): Promise<readonly ResolvedViewerEntry[]> {
  return resolved ??= modelsPackage().then(groups => {
    const { entries, payloads } = viewerCatalog(groups);
    return Object.freeze(entries.map(entry => {
      const resolution = resolveEntry(entry, payloads);
      if (resolution.status !== 'resolved') throw new Error(`${entry.id} does not resolve: ${resolution.failure.code}`);
      return { entry, resolved: resolution.entry };
    }));
  });
}

/** The first resolved entry of `kind`, and of `role` when given. */
export async function firstEntry(kind: ViewerEntry['kind'], role?: string): Promise<ResolvedViewerEntry> {
  const found = (await modelsEntries()).find(({ entry }) => entry.kind === kind && (role === undefined || entry.role === role));
  if (!found) throw new Error(`The models package has no ${kind} ${role ?? ''}`);
  return found;
}

/** Imports `files` on the test entry and opens the viewer, whose heading takes focus. */
export async function openViewer(page: Page, files: readonly FilePayload[], options: TestEntryOptions = {}): Promise<void> {
  await importFiles(page, files, options);
  await button(page, 'Return to menu').click();
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
}

export const entryButton = (page: Page, id: string) => page.getByTestId('viewer-entries').getByRole('button', { name: new RegExp(`^${id.replace(/[/.-]/g, '\\$&')} \\(`) });

export interface ViewerDiagnostics {
  readonly state: string;
  readonly item: string;
  readonly draws: number;
  readonly gpu: readonly number[] | null;
  readonly layout: ViewportLayout | null;
  readonly placement: PicturePlacement | null;
  readonly view: ViewerView;
}

/** The renderer's diagnostics, as the page shows them after a refresh. */
export async function viewerDiagnostics(page: Page): Promise<ViewerDiagnostics> {
  await page.getByRole('button', { name: 'Refresh diagnostics', exact: true }).click();
  const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-testid^="viewer-diagnostic-"]')]
    .map(element => [element.dataset.testid!.slice('viewer-diagnostic-'.length), element.textContent ?? ''])));
  const parse = (value: string) => (value === 'none' ? null : JSON.parse(value));
  const gpu = /^(\d+) geometries, (\d+) textures, (\d+) programs$/.exec(rows.gpu);
  return {
    state: rows.state, item: rows.item, draws: Number(rows.draws), gpu: gpu ? gpu.slice(1).map(Number) : null,
    layout: parse(rows.layout), placement: parse(rows.placement), view: JSON.parse(rows.view),
  };
}

/** The largest drawing-buffer side the viewer canvas's context accepts, as the viewer surface reads it. */
export const maxDrawingBufferSize = (page: Page): Promise<number> => page.getByTestId('viewer-view').locator('canvas').evaluate(canvas => {
  const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
  if (!gl) throw new Error('Missing WebGL 2 context');
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  return Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
});

/** A drawing-buffer pixel, counted from the top-left, and the bytes expected there. */
export interface Sample {
  readonly x: number;
  readonly y: number;
  readonly rgb: readonly [number, number, number];
  /** 3D samples only: whether the bytes are a texel. */
  readonly textured?: boolean;
}

/**
 * The bytes of drawing-buffer pixels as composited on the page: a screenshot of the picture area, decoded in the page.
 * The canvas sits at the layout's frame inside the area, one buffer pixel per screenshot pixel at the frame's device
 * scale.
 */
export async function bufferPixels(page: Page, layout: ViewportLayout, points: readonly { readonly x: number; readonly y: number }[]) {
  const screenshot = await page.getByTestId('viewer-view').screenshot({ animations: 'disabled', caret: 'hide' });
  return page.evaluate(async ({ bytes, origin, points: wanted }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screenshot decode requires a 2D context');
      context.drawImage(bitmap, 0, 0);
      return wanted.map(({ x, y }) => [...context.getImageData(origin.x + x, origin.y + y, 1, 1).data.slice(0, 3)]);
    } finally {
      bitmap.close();
    }
  }, {
    bytes: [...screenshot],
    origin: { x: Math.round(layout.frame.left * layout.pixelRatio), y: Math.round(layout.frame.top * layout.pixelRatio) },
    points: points.map(({ x, y }) => ({ x, y })),
  });
}

export async function expectSamples(page: Page, layout: ViewportLayout, samples: readonly Sample[]): Promise<void> {
  expect(samples.length).toBeGreaterThan(0);
  expect(await bufferPixels(page, layout, samples), JSON.stringify(samples)).toEqual(samples.map(({ rgb }) => [...rgb]));
}

/** The picture a 2D item draws: an image or layout as expanded, a palette or font as its sheet. */
export function pictureOf(item: ViewerItem): ExpandedImage {
  switch (item.kind) {
    case 'image': case 'layout': return item.picture;
    case 'palette': return paletteSheet(item.palette);
    case 'font': return glyphSheet(item.font);
    default: throw new Error(`${item.kind} is not a picture`);
  }
}

/**
 * Up to `count` samples of a 2D picture placed at `placement`: the centre pixel of texels spread over the picture,
 * opaque ones with their bytes and transparent ones with the checkerboard grey behind them; at least one mid-tone.
 */
export function pictureSamples(picture: ExpandedImage, placement: PicturePlacement, count = 24): Sample[] {
  const { width, height, rgba } = picture;
  const samples: Sample[] = [];
  const step = Math.max(1, Math.floor((width * height) / count));
  for (let texel = Math.floor(step / 2); texel < width * height && samples.length < count; texel += step) {
    const [tx, ty] = [texel % width, Math.floor(texel / width)];
    const x = Math.floor(placement.left + ((tx + 0.5) * placement.width) / width);
    const y = Math.floor(placement.top + ((ty + 0.5) * placement.height) / height);
    const at = texel * 4;
    const opaque = rgba[at + 3] === 255;
    // The checkerboard's first square, in its first grey, is at the picture's top-left corner.
    const grey = CHECKER_GREYS[(Math.floor((x - placement.left) / CHECKER_SQUARE) + Math.floor((y - placement.top) / CHECKER_SQUARE)) % 2];
    samples.push({ x, y, rgb: opaque ? [rgba[at], rgba[at + 1], rgba[at + 2]] : [grey, grey, grey] });
  }
  return samples;
}

/** The item drawn in Node by the viewer's renderer on a surface of the page's size, and the recording of that draw. */
export function drawInNode(item: ViewerItem, layout: ViewportLayout, view?: ViewerView) {
  const surface = new RecordingSurface();
  surface.maxDrawingBufferSize = 16_384;
  const renderer = createViewerRenderer({ surface, reportError: error => { throw error; } });
  // The picture area is the frame plus its letterbox on both sides.
  const { frame } = layout;
  surface.resize(frame.width + 2 * frame.left, frame.height + 2 * frame.top, layout.pixelRatio);
  if (view) renderer.setView(view);
  renderer.show(item);
  const draw = surface.lastDraw;
  if (!draw) throw new Error('Nothing was drawn');
  expect(surface.layouts.at(-1)).toEqual(layout);
  return { draw, renderer };
}

/**
 * Up to `count` samples of a 3D item: pixels whose ray and its eight neighbours' rays first hit the same mesh, and for
 * a textured mesh the same opaque texel, well clear of any other surface behind them. The expected bytes are the
 * mesh's colour, or the texel at the hit's UV with repeat wrapping, nearest sampling and v = 0 at the first row.
 */
export function solidSamples(item: ViewerItem, layout: ViewportLayout, view?: ViewerView, count = 12): Sample[] {
  const { draw, renderer } = drawInNode(item, layout, view);
  let root: Object3D = draw.objects[0].mesh;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  draw.camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  const { bufferWidth, bufferHeight } = layout;
  const meshes = draw.objects.map(({ mesh }) => mesh);
  /** What the pixel shows: a key naming the mesh and texel, and its bytes; null when unknown or not opaque. */
  const look = (x: number, y: number): { readonly key: string; readonly rgb: [number, number, number] } | null => {
    raycaster.setFromCamera(new Vector2(((x + 0.5) / bufferWidth) * 2 - 1, 1 - ((y + 0.5) / bufferHeight) * 2), draw.camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const [first] = hits;
    const behind = hits.find(hit => hit.object !== first.object);
    if (behind && behind.distance - first.distance <= 1e-3 * first.distance) return null;
    const material = (first.object as unknown as { material: MeshBasicMaterial }).material;
    const mesh = meshes.indexOf(first.object as (typeof meshes)[number]);
    if (!material.map) return { key: `${mesh}`, rgb: material.color.toArray().map(channel => Math.round(channel * 255)) as [number, number, number] };
    if (!first.uv) return null;
    const { data, width, height } = material.map.image as { data: Uint8Array; width: number; height: number };
    const texel = (coordinate: number, size: number) => Math.min(size - 1, Math.floor((coordinate - Math.floor(coordinate)) * size));
    const [tx, ty] = [texel(first.uv.x, width), texel(first.uv.y, height)];
    const at = (ty * width + tx) * 4;
    if (data[at + 3] !== 255) return null;
    return { key: `${mesh}:${tx},${ty}`, rgb: [data[at], data[at + 1], data[at + 2]] };
  };
  const samples: Sample[] = [];
  const seen = new Set<string>();
  const grid = Math.max(4, Math.floor(Math.min(bufferWidth, bufferHeight) / 40));
  for (let y = grid; y < bufferHeight - grid; y += grid) {
    for (let x = grid; x < bufferWidth - grid; x += grid) {
      const centre = look(x, y);
      if (!centre) continue;
      if (![-1, 0, 1].every(dy => [-1, 0, 1].every(dx => look(x + dx, y + dy)?.key === centre.key))) continue;
      const mesh = centre.key.split(':')[0];
      // One sample per mesh first, so every part is covered before any gets a second.
      const sample = { x, y, rgb: centre.rgb, textured: centre.key.includes(':') };
      if (seen.has(mesh)) samples.push(sample);
      else {
        seen.add(mesh);
        samples.unshift(sample);
      }
    }
  }
  renderer.dispose();
  return samples.slice(0, count);
}
