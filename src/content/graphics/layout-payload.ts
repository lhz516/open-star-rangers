import { ASSET_ID_LIMITS, type AssetId } from '../asset-id.ts';
import {
  GRAPHICS_LIMITS, asciiBytes, asciiText, bytesAt, invalid, payloadView, readReference, requireInteger, requireLength,
} from './graphics-format.ts';

// Layout payload schema 1, little-endian:
//   0      u16  frame width, 1–640
//   2      u16  frame height, 1–480
//   4      u8   element count N, 1–16
//   5      N × 5-byte element table in draw order, later elements on top:
//            u16  x, 0 to width − 1: frame column of the image's left edge
//            u16  y, 0 to height − 1: frame row of the image's top edge
//            u8   image Asset ID length L, 1–128
//   5+5N   the N image Asset IDs, ASCII, in element order and pairwise distinct

export interface LayoutFrame {
  readonly width: number;
  readonly height: number;
}

export interface LayoutElement {
  readonly image: AssetId;
  /** Frame pixel of the image's top-left corner; the image size lives only in the image payload. */
  readonly x: number;
  readonly y: number;
}

export interface LayoutPayload {
  readonly kind: 'layout';
  readonly frame: LayoutFrame;
  /** 1–16 elements in draw order, later ones on top, each drawing a different image. */
  readonly elements: readonly LayoutElement[];
}

const HEADER_BYTES = 5;
const ELEMENT_BYTES = 5;

/** Encoded length of a layout with these elements. */
export const layoutPayloadLength = ({ elements }: Pick<LayoutPayload, 'elements'>): number =>
  elements.reduce((length, { image }) => length + ELEMENT_BYTES + image.length, HEADER_BYTES);

const frameOf = (width: unknown, height: unknown, path: string): LayoutFrame => Object.freeze({
  width: requireInteger(width, 1, GRAPHICS_LIMITS.imageWidth, `${path}.width`),
  height: requireInteger(height, 1, GRAPHICS_LIMITS.imageHeight, `${path}.height`),
});

/** Checks one element inside `frame` whose image no earlier element in `seen` draws, and returns it frozen. */
function elementOf(image: unknown, x: unknown, y: unknown, frame: LayoutFrame, seen: Set<AssetId>, path: string): LayoutElement {
  const column = requireInteger(x, 0, frame.width - 1, `${path}.x`);
  const row = requireInteger(y, 0, frame.height - 1, `${path}.y`);
  const id = readReference(image, 'image', `${path}.image`);
  if (seen.has(id)) invalid(`${path}.image`, 'must differ from the image of every other element');
  seen.add(id);
  return Object.freeze({ image: id, x: column, y: row });
}

/** Encodes a layout into a new buffer that the result owns entirely. */
export function encodeLayoutPayload(layout: Omit<LayoutPayload, 'kind'>, path = 'layout'): Uint8Array<ArrayBuffer> {
  if (typeof layout.frame !== 'object' || layout.frame === null) invalid(`${path}.frame`, 'must have a width and height');
  const frame = frameOf(layout.frame.width, layout.frame.height, `${path}.frame`);
  const { elements } = layout;
  if (!Array.isArray(elements) || elements.length < 1 || elements.length > GRAPHICS_LIMITS.layoutElements) {
    invalid(`${path}.elements`, `must be 1 to ${GRAPHICS_LIMITS.layoutElements} elements`);
  }
  const seen = new Set<AssetId>();
  const checked = elements.map((element, index) => {
    const at = `${path}.elements[${index}]`;
    if (typeof element !== 'object' || element === null) invalid(at, 'must be an element');
    return elementOf(element.image, element.x, element.y, frame, seen, at);
  });
  const bytes = new Uint8Array(layoutPayloadLength({ elements: checked }));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, frame.width, true);
  view.setUint16(2, frame.height, true);
  bytes[4] = checked.length;
  let idAt = HEADER_BYTES + checked.length * ELEMENT_BYTES;
  checked.forEach(({ image, x, y }, index) => {
    const at = HEADER_BYTES + index * ELEMENT_BYTES;
    view.setUint16(at, x, true);
    view.setUint16(at + 2, y, true);
    bytes[at + 4] = image.length;
    bytes.set(asciiBytes(image), idAt);
    idAt += image.length;
  });
  return bytes;
}

/** Strictly reads a layout payload into frozen data. */
export function readLayoutPayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): LayoutPayload {
  const view = payloadView(bytes, schemaVersion, path);
  if (view.byteLength < HEADER_BYTES) invalid(path, 'is truncated');
  const frame = frameOf(view.getUint16(0, true), view.getUint16(2, true), `${path}.frame`);
  const count = requireInteger(view.getUint8(4), 1, GRAPHICS_LIMITS.layoutElements, `${path}.elements`);
  const idsAt = HEADER_BYTES + count * ELEMENT_BYTES;
  if (view.byteLength < idsAt) invalid(path, 'is truncated');
  const idLengths = Array.from({ length: count }, (_, index) =>
    requireInteger(view.getUint8(HEADER_BYTES + index * ELEMENT_BYTES + 4), 1, ASSET_ID_LIMITS.totalLength, `${path}.elements[${index}].image`));
  requireLength(view, idLengths.reduce((length, idLength) => length + idLength, idsAt), path);
  const seen = new Set<AssetId>();
  let idAt = idsAt;
  const elements = idLengths.map((idLength, index) => {
    const at = HEADER_BYTES + index * ELEMENT_BYTES;
    const image = asciiText(bytesAt(view, idAt, idLength));
    idAt += idLength;
    return elementOf(image, view.getUint16(at, true), view.getUint16(at + 2, true), frame, seen, `${path}.elements[${index}]`);
  });
  return Object.freeze({ kind: 'layout', frame, elements: Object.freeze(elements) });
}
