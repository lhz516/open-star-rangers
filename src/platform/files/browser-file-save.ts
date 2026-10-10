import type { FileSave } from '../../app/mission/mission-ports.ts';
import { createFileSave } from './file-save.ts';

/** Saves through a Blob object URL and a hidden `<a download>` added to the body for the click. */
export function createBrowserFileSave(): FileSave {
  return createFileSave({
    createObjectURL: blob => URL.createObjectURL(blob),
    revokeObjectURL: url => { URL.revokeObjectURL(url); },
    attachLink(url, name) {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      return link;
    },
  });
}
