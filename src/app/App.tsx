import { SyntheticDevPanel } from '../ui/dev/SyntheticDevPanel.tsx';
import { useSyntheticDemoOwner } from './composition/use-synthetic-demo-owner.ts';

// The import flow and menus arrive in later P1 tasks; until then the page hosts the synthetic dev panel.
export function App() {
  const owner = useSyntheticDemoOwner();
  return (
    <main>
      <h1>Open Star Rangers</h1>
      <p>Browser re-implementation in progress. No original game content is included.</p>
      {owner ? <SyntheticDevPanel store={owner.store} dispatch={owner.dispatch} /> : <p>Preparing the synthetic demo…</p>}
    </main>
  );
}
