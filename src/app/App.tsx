import { useState } from 'react';
import { SyntheticDevPanel } from '../ui/dev/SyntheticDevPanel.tsx';
import { SyntheticRenderView } from '../ui/render/SyntheticRenderView.tsx';
import { createSyntheticDemoLifecycle } from './composition/synthetic-demo-lifecycle.ts';
import { useSyntheticDemoOwner } from './composition/use-synthetic-demo-owner.ts';

// The menu shell arrives in the next P1-08 subtask; until then the page hosts the synthetic demo.
export function App() {
  const [lifecycle] = useState(() => createSyntheticDemoLifecycle({ onCleanupFailure: reportError, reportError }));
  const { owner, containerRef } = useSyntheticDemoOwner(lifecycle);
  return (
    <main>
      <h1>Open Star Rangers</h1>
      <p>Browser re-implementation in progress. No original game content is included.</p>
      <SyntheticRenderView ref={containerRef} renderer={owner?.renderer ?? null} />
      {owner && <SyntheticDevPanel store={owner.store} dispatch={owner.dispatch} renderer={owner.renderer} />}
    </main>
  );
}
