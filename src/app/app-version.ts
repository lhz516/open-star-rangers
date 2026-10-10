/**
 * The app's producer label for the recordings it exports (docs/plan/p3/04/spec.md, Runtime 录制): the application name,
 * the package version and the build mode, 1 to 128 UTF-16 code units. Only development builds record.
 */
import { PRODUCER_MAX_LENGTH } from '../core/replay/recording.ts';

/** As `name` in package.json. */
export const APP_NAME = 'open-star-rangers';
/** As `version` in package.json; update both together. */
export const APP_VERSION = '0.0.1';

/** `open-star-rangers 0.0.1 development` for the Vite build mode `development`; a longer mode is cut to fit. */
export function appProducer(mode: string): string {
  return `${APP_NAME} ${APP_VERSION} ${mode}`.slice(0, PRODUCER_MAX_LENGTH);
}
