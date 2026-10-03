import { SyntheticDevPanel } from '../ui/dev/SyntheticDevPanel.tsx';
import { SyntheticRenderView } from '../ui/render/SyntheticRenderView.tsx';
import { useSyntheticDemoOwner } from './composition/use-synthetic-demo-owner.ts';

// The import flow and menus arrive in later P1 tasks; until then the page hosts the synthetic demo.
export function App() {
  const { owner, containerRef } = useSyntheticDemoOwner();
  return (
    <main>
      <h1>Open Star Rangers</h1>
      <p>Browser re-implementation in progress. No original game content is included.</p>
      <SyntheticRenderView ref={containerRef} renderer={owner?.renderer ?? null} />
      {owner && <SyntheticDevPanel store={owner.store} dispatch={owner.dispatch} renderer={owner.renderer} />}
    </main>
  );
}
