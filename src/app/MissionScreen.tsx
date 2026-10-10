/**
 * The mission screen: the mission page with its owner (docs/plan/p3/04/spec.md, 应用流程). A module of its own, so a
 * Fast Refresh of the owner hook or the mission pages re-runs this screen only, and the app shell keeps its resource
 * holder and the slot's confirmed wingman choice. Development builds add the diagnostics panel, loaded through a dynamic
 * import behind the compile-time `import.meta.env.DEV`, so production builds contain no part of it.
 */
import { MissionPage } from '../ui/mission/MissionPage.tsx';
import type { MissionSlot } from './composition/mission-slot.ts';
import { useMissionOwner } from './composition/use-mission-owner.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceHolder } from './resources/resource-holder.ts';

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
  const devPanel = MissionDevPanel && mission?.diagnostics
    ? <MissionDevPanel diagnostics={mission.diagnostics} game={mission.store.reader} submitCommand={command => mission.feedback.submit(command)} />
    : null;
  return (
    <MissionPage
      mission={mission && { owner: mission.owner, game: mission.store.reader }}
      openFailure={openFailure}
      devPanel={devPanel}
      onReturn={onReturn}
    />
  );
}
