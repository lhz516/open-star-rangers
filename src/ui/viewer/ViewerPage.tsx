/**
 * The resource viewer (P2-11 S-07 to S-09): the held package's items by kind, the selected item's picture in a 4:3 area
 * the viewer surface draws in, its variants and view controls, the renderer's state and diagnostics, the sounds and the
 * mission's structure. React only submits intents to the viewer owner and renders on its changes, never per drawn
 * frame. A diagnostic view of imported resources, not the original game's screens.
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { ResourceHolderSnapshot } from '../../app/resources/resource-holder.ts';
import type { ViewerEntry } from '../../app/viewer/viewer-items.ts';
import type { ViewerOwner, ViewerOwnerSnapshot } from '../../app/viewer/viewer-owner.ts';
import type { ViewerRenderDiagnostics, ViewerRendererStatus } from '../../render/viewer/viewer-renderer.ts';
import { VIEW_LIMITS, type ViewerViewAction } from '../../render/viewer/viewer-view.ts';
import { describeError } from '../game/describe-error.ts';
import { missionFailureCopy } from '../import/failure-copy.ts';
import { FailureNotice } from '../import/FailureNotice.tsx';
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';
import { ViewerAudioPanel } from './ViewerAudioPanel.tsx';
import { appearanceText, KIND_HEADINGS, KIND_ORDER, missionLines, TEXTURE_UNMAPPED, variantLabel } from './viewer-copy.ts';
import { viewerKeyAction } from './viewer-keys.ts';

export interface ViewerPageProps {
  /** Null until the owner exists, between owners, and when none may be created. */
  readonly viewer: ViewerOwner | null;
  /** Callback ref of the picture area, which the viewer surface draws in; React renders no children into it. */
  readonly viewRef: (element: HTMLElement | null) => void;
  /** The mounted picture area, whose keys turn and zoom the view while it has focus. */
  readonly view: HTMLElement | null;
  readonly resources: ResourceHolderSnapshot | null;
  readonly onReturn: () => void;
}

/** Content box per the 4:3 layout rule; the black background is the letterbox. */
const viewStyle: CSSProperties = {
  boxSizing: 'content-box', width: '100%', height: 'clamp(240px, 60vh, 720px)', padding: 0, border: 0,
  position: 'relative', overflow: 'hidden', background: '#000',
};

const NO_STORE = Object.freeze({ subscribe: () => () => {}, getSnapshot: () => null });

function describeStatus(status: ViewerRendererStatus | null): { readonly alert: boolean; readonly text: string } {
  switch (status?.state) {
    case undefined: return { alert: false, text: 'Preparing the viewer…' };
    case 'ready': return { alert: false, text: 'Picture ready.' };
    case 'context-lost': return { alert: false, text: 'The WebGL context was lost; the picture returns when the browser restores it.' };
    case 'unavailable':
      return { alert: true, text: `WebGL 2 is unavailable, so no picture can be shown (${describeError(status.error)}). The lists, the mission and the sounds still work.` };
    case 'failed':
      return { alert: true, text: `The picture failed and stopped drawing (${describeError(status.error)}). Return to the menu and open the viewer again to retry.` };
    case 'disposed': return { alert: false, text: 'Picture released.' };
  }
}

const VIEW_BUTTONS: readonly (readonly [string, ViewerViewAction])[] = Object.freeze([
  ['Turn left', { type: 'rotate', axis: 'vertical', steps: -1 }],
  ['Turn right', { type: 'rotate', axis: 'vertical', steps: 1 }],
  ['Turn up', { type: 'rotate', axis: 'horizontal', steps: -1 }],
  ['Turn down', { type: 'rotate', axis: 'horizontal', steps: 1 }],
  ['Zoom in', { type: 'zoom', steps: 1 }],
  ['Zoom out', { type: 'zoom', steps: -1 }],
  ['Reset view', { type: 'reset' }],
]);

function Diagnostics({ diagnostics }: { readonly diagnostics: ViewerRenderDiagnostics }) {
  const { state, item, draws, gpu, layout, placement, view } = diagnostics;
  const rows: readonly (readonly [string, string])[] = [
    ['state', state],
    ['item', item ? `${item.kind} ${item.id}` : 'none'],
    ['draws', String(draws)],
    ['gpu', gpu ? `${gpu.geometries} geometries, ${gpu.textures} textures, ${gpu.programs} programs` : 'none'],
    ['layout', layout ? JSON.stringify(layout) : 'none'],
    ['placement', placement ? JSON.stringify(placement) : 'none'],
    ['view', JSON.stringify(view)],
  ];
  return (
    <dl>
      {rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd data-testid={`viewer-diagnostic-${name}`}>{value}</dd></div>)}
    </dl>
  );
}

function Selection({ viewer, snapshot, entry }: { readonly viewer: ViewerOwner; readonly snapshot: ViewerOwnerSnapshot; readonly entry: ViewerEntry }) {
  const { variant, variants, view, failures } = snapshot;
  const failure = failures[entry.id];
  const shown = variants[variant];
  return (
    <section aria-labelledby="viewer-selection-heading" data-testid="viewer-selection">
      <h3 id="viewer-selection-heading">{`Selected: ${entry.id}`}</h3>
      {failure && (
        <div role="alert" data-testid="viewer-item-failure">
          <p>This item could not be read or expanded; the other items are unaffected.</p>
          <dl><dt>Code</dt><dd>{failure.code}</dd><dt>Location</dt><dd>{failure.path}</dd><dt>Reason</dt><dd>{failure.reason}</dd></dl>
        </div>
      )}
      {!failure && variants.length > 0 && (
        <fieldset>
          <legend>{entry.kind === 'model' ? 'Part list' : 'Effect view'}</legend>
          {variants.map((candidate, index) => (
            <label key={index} className="viewer-variant">
              <input type="radio" name="viewer-variant" checked={index === variant} onChange={() => { viewer.select(entry.id, index); }} />
              {variantLabel(candidate)}
            </label>
          ))}
        </fieldset>
      )}
      {shown?.kind === 'effect-view' && (
        <>
          <ul data-testid="viewer-shapes">
            {shown.shapes.map((appearance, index) => <li key={index}>{`Shape ${index}: ${appearanceText(appearance)}`}</li>)}
          </ul>
          {shown.shapes.some(({ textureUnmapped }) => textureUnmapped) && <p role="note" data-testid="viewer-texture-unmapped">{TEXTURE_UNMAPPED}</p>}
        </>
      )}
      {!failure && entry.kind === 'model' && (
        <label>
          <input type="checkbox" checked={view.lit} onChange={event => { viewer.changeView({ type: 'light', lit: event.target.checked }); }} />
          Neutral light (not the original lighting)
        </label>
      )}
      {!failure && entry.kind === 'effect' && entry.role === 'missile' && (
        <label>
          {'Texture rotation '}
          <select value={view.mappingRotation} onChange={event => { viewer.changeView({ type: 'mapping-rotation', index: Number(event.target.value) }); }}>
            {Array.from({ length: VIEW_LIMITS.mappingRotations }, (_, index) => <option key={index} value={index}>{index}</option>)}
          </select>
          {' (no effect on the picture until the texture mapping is known)'}
        </label>
      )}
    </section>
  );
}

export function ViewerPage({ viewer, viewRef, view, resources, onReturn }: ViewerPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const owner = viewer ?? NO_STORE;
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const renderer = viewer?.renderer ?? NO_STORE;
  const status = useSyncExternalStore(renderer.subscribe, renderer.getSnapshot);
  const [diagnostics, setDiagnostics] = useState<ViewerRenderDiagnostics | null>(null);
  const { alert, text } = describeStatus(status);

  useEffect(() => {
    if (!view || !viewer) return;
    const onKey = (event: KeyboardEvent): void => {
      const action = viewerKeyAction(event);
      if (!action) return;
      event.preventDefault();
      viewer.changeView(action);
    };
    view.addEventListener('keydown', onKey);
    return () => { view.removeEventListener('keydown', onKey); };
  }, [view, viewer]);

  const held = resources?.package ?? null;
  const entries = snapshot?.entries ?? [];
  const selected = snapshot?.selected ? entries.find(({ id }) => id === snapshot.selected) ?? null : null;
  const lines = held ? missionLines(held.mission) : null;
  return (
    <section aria-labelledby="viewer-heading">
      <h2 id="viewer-heading" ref={heading} tabIndex={-1}>Resource viewer</h2>
      <p>A diagnostic view of the resources converted from your own data, not the original game&apos;s screens.</p>
      {held?.completeness.status === 'complete' && (
        <p data-testid="viewer-identity">
          {`Package identity: manifest ${held.completeness.identity.manifestIdentity}, converter ${held.completeness.identity.converterVersion}`}
        </p>
      )}
      {held && held.completeness.status !== 'complete' && (
        <p role="note" data-testid="viewer-partial">
          {'This package is partial and not a usable resource package; only its complete groups are listed. '}
          {held.groups.map(({ group, status: state }) => `${group}: ${state}`).join('; ')}
        </p>
      )}
      <nav aria-label="Viewer items" data-testid="viewer-entries">
        {entries.length === 0 && <p>No items to show.</p>}
        {KIND_ORDER.map(kind => {
          const listed = entries.filter(entry => entry.kind === kind);
          if (listed.length === 0) return null;
          return (
            <div key={kind}>
              <h3>{KIND_HEADINGS[kind]}</h3>
              <ul>
                {listed.map(({ id, role }) => (
                  <li key={id}>
                    <button type="button" aria-pressed={snapshot?.selected === id} onClick={() => { viewer?.select(id); }}>
                      {`${id} (${role})${snapshot?.failures[id] ? ', failed' : ''}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      {viewer && snapshot && selected && <Selection viewer={viewer} snapshot={snapshot} entry={selected} />}
      <p role={alert ? 'alert' : 'status'} data-testid="viewer-render-status">{text}</p>
      <div
        ref={viewRef}
        className="viewer-view"
        style={viewStyle}
        tabIndex={0}
        role="application"
        aria-label={`Resource viewer picture: ${selected ? selected.id : 'nothing selected'}`}
        aria-describedby="viewer-keys"
        data-testid="viewer-view"
      />
      <p id="viewer-keys">With the picture focused, the arrow keys turn models and effects, + and - zoom, and 0 resets the view.</p>
      <div role="group" aria-label="View">
        {VIEW_BUTTONS.map(([label, action]) => (
          <button key={label} type="button" onClick={() => { viewer?.changeView(action); }}>{label}</button>
        ))}
      </div>
      {snapshot && <p data-testid="viewer-view-state">{`Turned ${snapshot.view.yaw}° and ${snapshot.view.pitch}°, zoom ${snapshot.view.zoom}×`}</p>}
      <section aria-labelledby="viewer-diagnostics-heading">
        <h3 id="viewer-diagnostics-heading">Render diagnostics</h3>
        <button type="button" disabled={!viewer} onClick={() => { setDiagnostics(viewer?.renderer.diagnostics() ?? null); }}>Refresh diagnostics</button>
        {diagnostics && <Diagnostics diagnostics={diagnostics} />}
      </section>
      <ViewerAudioPanel audio={snapshot?.audio ?? null} />
      <section aria-labelledby="viewer-mission-heading" data-testid="viewer-mission">
        <h3 id="viewer-mission-heading">Mission</h3>
        {held?.mission.status === 'failed' && <FailureNotice testId="viewer-mission-failure" copy={missionFailureCopy(held.mission.failure)} />}
        {held?.mission.status === 'not-attempted' && <p>The mission was not loaded: the package holds no complete logic group.</p>}
        {lines && <ul data-testid="viewer-mission-summary">{lines.map(line => <li key={line}>{line}</li>)}</ul>}
      </section>
      <p>
        <button type="button" onClick={onReturn}>Return to menu</button>
      </p>
    </section>
  );
}
