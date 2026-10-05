// Disc-relative paths (P2-02 S-05), shared by source-mapping locators and disc reading so both accept the same paths.

declare const discPathBrand: unique symbol;

/** 1–8 `/`-separated upper-case 8.3 names, such as `MAIN/SR.NOB`. Never upper-cased or otherwise normalized. */
export type DiscPath = string & { readonly [discPathBrand]: 'DiscPath' };

const MAX_PATH_SEGMENTS = 8;
const DOS_NAME = /^[A-Z0-9_-]{1,8}(?:\.[A-Z0-9_-]{1,3})?$/;

/** Whether `name` is one upper-case 8.3 path segment. */
export const isDosName = (name: string): boolean => DOS_NAME.test(name);

export function isDiscPath(value: unknown): value is DiscPath {
  if (typeof value !== 'string') return false;
  const segments = value.split('/');
  return segments.length <= MAX_PATH_SEGMENTS && segments.every(isDosName);
}
