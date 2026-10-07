/**
 * The import screen: the import page with its job owner (P2-11 S-02). A module of its own, so a Fast Refresh of the job
 * hook re-runs this screen's effects only, and the app shell keeps its resource holder (S-12).
 */
import { ImportPage } from '../ui/import/ImportPage.tsx';
import { useImportJob } from './import/use-import-job.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceHolder, ResourceHolderSnapshot } from './resources/resource-holder.ts';

/** Creates and releases the import page's job owner with the screen. */
export function ImportScreen({ ports, holder, resources, onReturn }: {
  readonly ports: AppPorts;
  readonly holder: ResourceHolder | null;
  readonly resources: ResourceHolderSnapshot | null;
  readonly onReturn: () => void;
}) {
  const job = useImportJob(ports, holder);
  return (
    <ImportPage
      job={job}
      resources={resources}
      checkSpace={async () => (holder ? holder.checkSpace() : null)}
      onSave={() => { holder?.save(); }}
      onReturn={onReturn}
    />
  );
}
