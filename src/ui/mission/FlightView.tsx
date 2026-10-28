/**
 * The flight area of the game view (docs/plan/p3/12/spec.md: 渲染器生命周期, 画面合成与 P3-13 接口): it holds the owner's
 * flight canvas, whose picture includes P3-13's cockpit, HUD and map, while mounted, and says why the picture is missing
 * when the renderer is not drawing. Nothing covers the picture otherwise. The canvas and its context belong to the
 * owner, not to this component: unmounting only takes the canvas out of the page.
 */
import { useSyncExternalStore } from 'react';
import type { FlightRenderer } from '../../render/flight/renderer/flight-renderer.ts';
import { flightNotice } from './mission-copy.ts';

export interface MissionFlightView {
  readonly renderer: Pick<FlightRenderer, 'getSnapshot' | 'subscribe'>;
  /** Receives the area as it mounts and null as it unmounts. Keep its identity: a new function rebinds the area. */
  readonly bindFlightArea: (area: HTMLElement | null) => void;
}

export function FlightView({ flight }: { readonly flight: MissionFlightView | null }) {
  return (
    <div className="flight-view" data-testid="flight-view">
      {flight && <FlightPicture flight={flight} />}
    </div>
  );
}

function FlightPicture({ flight }: { readonly flight: MissionFlightView }) {
  const status = useSyncExternalStore(flight.renderer.subscribe, flight.renderer.getSnapshot);
  const notice = flightNotice(status);
  return (
    <>
      <div ref={flight.bindFlightArea} className="flight-area" data-testid="flight-area" data-state={status.state} />
      {notice && (
        <div role={notice.alert ? 'alert' : 'status'} className="flight-notice" data-testid="flight-notice" data-state={status.state}>
          <p>{notice.text}</p>
          {notice.detail && <pre>{notice.detail}</pre>}
        </div>
      )}
    </>
  );
}
