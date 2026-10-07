/**
 * What one shown item puts in the viewer's scene, and the 2D picture display of images, layouts, palettes and fonts.
 * A display owns every geometry, material and texture it creates, so nothing outlives the item that needed it and the
 * GPU counters depend only on what is shown.
 */
import { Mesh, OrthographicCamera, PlaneGeometry, type Camera, type Scene } from 'three';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import { attemptAll } from '../scene/cleanup.ts';
import type { ViewportLayout } from '../viewport/viewport-layout.ts';
import { CHECKER_SQUARE, checkerTexture, pictureMaterial, pictureTexture } from './viewer-presentation.ts';
import { placePicture, type PictureFit, type PicturePlacement } from './viewer-pictures.ts';

export interface ViewerDisplay {
  readonly camera: Camera;
  /** Fits the camera and objects to the drawing buffer; returns where the picture is. */
  place(layout: ViewportLayout): PicturePlacement;
  /** Removes its objects from the scene and disposes everything it created, attempting every step; returns the failures. */
  dispose(): unknown[];
}

/**
 * Shows a picture in drawing-buffer pixels, with y up, over a neutral checkerboard covering the picture's rectangle that
 * shows through its transparent pixels. Validates the picture before adding anything to the scene.
 */
export function createPictureDisplay(scene: Scene, picture: ExpandedImage, fit: PictureFit, name: string): ViewerDisplay {
  const texture = pictureTexture(picture);
  // A unit square centred on the origin whose top edge is v = 0, so the picture's row 0 is at the top.
  const quad = new PlaneGeometry(1, 1);
  const uv = quad.getAttribute('uv');
  for (let vertex = 0; vertex < uv.count; vertex++) uv.setY(vertex, 1 - uv.getY(vertex));
  const checker = checkerTexture();
  const checkerMaterial = pictureMaterial(checker);
  const material = pictureMaterial(texture);
  const checkerMesh = new Mesh(quad, checkerMaterial);
  checkerMesh.name = 'checkerboard';
  const mesh = new Mesh(quad, material);
  mesh.name = name;
  mesh.renderOrder = 1;
  const camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  scene.add(checkerMesh, mesh);
  return {
    camera,
    place({ bufferWidth, bufferHeight }) {
      Object.assign(camera, { left: 0, right: bufferWidth, top: bufferHeight, bottom: 0 });
      camera.updateProjectionMatrix();
      const placement = placePicture(picture, fit, bufferWidth, bufferHeight);
      const { left, top, width, height } = placement;
      for (const object of [checkerMesh, mesh]) {
        object.position.set(left + width / 2, bufferHeight - top - height / 2, 0);
        object.scale.set(width, height, 1);
      }
      checker.repeat.set(width / (2 * CHECKER_SQUARE), height / (2 * CHECKER_SQUARE));
      return placement;
    },
    dispose() {
      scene.remove(checkerMesh, mesh);
      return attemptAll([material, texture, checkerMaterial, checker, quad].map(resource => () => { resource.dispose(); }));
    },
  };
}
