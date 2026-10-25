/**
 * The mission screen: the mission page with its owner (docs/plan/p3/04/spec.md, 应用流程). A module of its own, so a
 * Fast Refresh of the owner hook or the mission pages re-runs this screen only, and the app shell keeps its resource
 * holder and the slot's confirmed wingman choice. Development builds add the diagnostics panel, loaded through a dynamic
 * import behind the compile-time `import.meta.env.DEV`, so production builds contain no part of it.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { describeStructure } from '../ui/mission/mission-copy.ts';
import { createNoticeLatch } from '../ui/mission/input-notices.ts';
import { MissionPage } from '../ui/mission/MissionPage.tsx';
import type { InputNoticeLine, MissionInputView } from '../ui/mission/InputNotices.tsx';
import { SLICE_GAPS } from '../ui/mission/slice-gaps-copy.ts';
import type { InputStatus } from '../ui/game-input/input-status.ts';
import type { MissionSlot } from './composition/mission-slot.ts';
import { useMissionOwner } from './composition/use-mission-owner.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceHolder } from './resources/resource-holder.ts';

const EMPTY_INPUT_STATUS: InputStatus = Object.freeze({
  focusHint: false,
  gap: null,
  error: null,
  capabilities: Object.freeze({
    fullscreen: Object.freeze({ state: 'unsupported', ownerId: null, runId: null, generation: 0, failure: null }),
    keyboardLock: Object.freeze({ state: 'unsupported', ownerId: null, runId: null, generation: 0, failure: null }),
    pointerLock: Object.freeze({ state: 'unsupported', ownerId: null, runId: null, generation: 0, failure: null }),
  }),
  map: Object.freeze({ state: 'off', systemPointerHidden: false, error: null }),
});

const subscribeNever = (): (() => void) => () => undefined;

function inputNoticeLines(status: InputStatus): readonly InputNoticeLine[] {
  const lines: InputNoticeLine[] = [];
  const { fullscreen, keyboardLock, pointerLock } = status.capabilities;
  if (fullscreen.state === 'unsupported') lines.push({ key: 'fullscreen-unsupported', text: 'Full screen is unavailable in this browser.' });
  else if (fullscreen.state === 'pending') lines.push({ key: 'fullscreen-pending', text: 'Requesting full screen…' });
  else if (fullscreen.failure) lines.push({ key: `fullscreen-${fullscreen.generation}`, text: `Full screen failed: ${fullscreen.failure.reason}.` });
  if (keyboardLock.state === 'unsupported') lines.push({ key: 'keyboard-lock-unsupported', text: 'Keyboard Lock is unavailable; browser shortcuts may remain active.' });
  else if (keyboardLock.failure) lines.push({ key: `keyboard-lock-${keyboardLock.generation}`, text: `Keyboard Lock failed: ${keyboardLock.failure.reason}.` });
  if (status.map.state === 'not-ready') lines.push({ key: 'map-not-ready', text: 'Map input is not ready.' });
  else if (status.map.state === 'invalid') {
    lines.push({ key: 'map-invalid', text: `Map input is unavailable: ${describeStructure(status.map.error)}` });
  } else if (status.map.state === 'click-to-lock') lines.push({ key: 'map-click-to-lock', text: 'Click the map to lock the pointer.' });
  else if (status.map.state === 'locking') lines.push({ key: 'map-locking', text: 'Requesting pointer lock…' });
  else if (status.map.state === 'unlocked') {
    const reason = pointerLock.failure?.reason;
    lines.push({ key: 'map-unlocked', text: `Pointer Lock is unavailable${reason ? ` (${reason})` : ''}; using the system pointer.` });
  }
  return lines;
}

/** Loaded before this module finishes evaluating; null in production. */
const MissionDevPanel = import.meta.env.DEV ? (await import('../ui/dev/MissionDevPanel.tsx')).MissionDevPanel : null;

/** Creates and releases the mission owner with the screen. */
export function MissionScreen({ slot, ports, holder, onReturn }: {
  readonly slot: MissionSlot;
  readonly ports: AppPorts;
  readonly holder: ResourceHolder;
  readonly onReturn: () => void;
}) {
  const { mission, openFailure } = useMissionOwner(slot, ports, holder);
  const consumer = mission?.input ?? null;
  const zone = useRef<HTMLElement | null>(null);
  const bindZone = useCallback((element: HTMLElement | null): void => {
    if (zone.current) zone.current.style.cursor = '';
    zone.current = element;
    mission?.bindInputZone(element);
    if (element) element.style.cursor = mission?.input.status.getState().map.systemPointerHidden ? 'none' : '';
  }, [mission]);
  const subscribeInputStatus = useCallback(
    (callback: () => void) => consumer ? consumer.status.subscribe(callback) : subscribeNever(),
    [consumer],
  );
  const inputStatus = useSyncExternalStore(
    subscribeInputStatus,
    () => consumer?.status.getState() ?? EMPTY_INPUT_STATUS,
    () => consumer?.status.getInitialState() ?? EMPTY_INPUT_STATUS,
  );
  useEffect(() => {
    if (zone.current) zone.current.style.cursor = inputStatus.map.systemPointerHidden ? 'none' : '';
  }, [inputStatus.map.systemPointerHidden]);
  const [altF4Tip] = useState(createNoticeLatch);
  const [platformFamily] = useState(ports.mission.platformFamily);
  const input: MissionInputView | null = consumer ? {
    bindZone,
    focusHint: inputStatus.focusHint,
    gap: inputStatus.gap ? { id: inputStatus.gap.gap, serial: inputStatus.gap.serial, ...SLICE_GAPS[inputStatus.gap.gap] } : null,
    status: inputNoticeLines(inputStatus),
    error: inputStatus.error
      ? { key: `input-${inputStatus.error.serial}`, text: `Input ${inputStatus.error.operation} failed: ${describeStructure(inputStatus.error.cause)}` }
      : null,
    platformFamily,
    altF4Tip,
    fullscreen: {
      status: inputStatus.capabilities.fullscreen.state,
      request: () => { consumer.capabilities.requestFullscreen(); },
      requestOnStart: start => { consumer.capabilities.startWithFullscreen(start); },
    },
  } : null;
  const devPanel = MissionDevPanel && mission?.diagnostics
    ? <MissionDevPanel diagnostics={mission.diagnostics} game={mission.store.reader} submitCommand={command => mission.feedback.submit(command)} />
    : null;
  return (
    <MissionPage
      mission={mission && { owner: mission.owner, game: mission.store.reader, texts: mission.texts }}
      openFailure={openFailure}
      devPanel={devPanel}
      onReturn={onReturn}
      input={input}
    />
  );
}
