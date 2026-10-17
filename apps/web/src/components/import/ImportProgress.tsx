import type { ImportPhase } from '../../lib/import-api.js';

const LABELS: Record<ImportPhase, string> = {
  idle: '',
  queued: 'Queued',
  cloning: 'Cloning the repository',
  analyzing: 'Analyzing the import',
  ready: 'Ready',
  failed: 'Import failed',
};

export interface ImportProgressProps {
  phase: ImportPhase;
  /** The imported revision on success, or the error message on failure. */
  detail?: string | null;
}

/**
 * The import lifecycle readout. The phase is exposed as `data-phase` so the
 * browser tests can assert each state without depending on copy.
 */
export function ImportProgress({ phase, detail = null }: ImportProgressProps) {
  if (phase === 'idle') {
    return null;
  }

  const failed = phase === 'failed';
  const detailText = detail ? ` — ${detail}` : '';

  return (
    <p
      className={failed ? 'import-progress import-progress--failed' : 'import-progress'}
      role={failed ? 'alert' : 'status'}
      data-testid="import-phase"
      data-phase={phase}
    >
      <span className="import-progress-dot" aria-hidden="true" />
      {LABELS[phase]}
      {detailText}
    </p>
  );
}
