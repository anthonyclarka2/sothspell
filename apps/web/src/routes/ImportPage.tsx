import { useCallback, useEffect, useState } from 'react';
import { ImportForm } from '../components/import/ImportForm.js';
import { ImportList } from '../components/import/ImportList.js';
import { ImportProgress } from '../components/import/ImportProgress.js';
import {
  fetchImports,
  refreshImport,
  removeImport,
  startImport,
  type ImportPhase,
  type ImportRecord,
} from '../lib/import-api.js';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lets the queued state render before the request starts. */
function queuedTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * `/import` — paste a public GitHub URL, watch the clone progress, and manage
 * the read-only imports under SOTHSPELL_HOME. The page owns no project data;
 * it drives the import API and shows the resulting records.
 */
export function ImportPage() {
  const [imports, setImports] = useState<ImportRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setImports(await fetchImports());
      setListError(null);
    } catch (error) {
      setListError(messageOf(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = useCallback(
    async (input: { url: string; ref: string | null }) => {
      setPhaseDetail(null);
      setPhase('queued');
      await queuedTick();
      setPhase('cloning');
      try {
        const record = await startImport(input);
        setPhase('analyzing');
        setPhaseDetail(`${record.owner}/${record.repo}@${record.shortCommit}`);
        await load();
        setPhase('ready');
      } catch (error) {
        setPhaseDetail(messageOf(error));
        setPhase('failed');
      }
    },
    [load],
  );

  const handleRefresh = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await refreshImport(id);
        await load();
      } catch (error) {
        setListError(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await removeImport(id);
        await load();
      } catch (error) {
        setListError(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const busy = phase === 'queued' || phase === 'cloning' || phase === 'analyzing';
  const importedCount = imports?.length ?? 0;

  return (
    <div className="page import-page">
      <header className="import-hero">
        <h1>Import a repository</h1>
        <p>
          Paste a public GitHub URL. Sóþspell clones it read-only under SOTHSPELL_HOME,
          pins the resolved commit, and never runs project code.
        </p>
      </header>

      <ImportForm busy={busy} onSubmit={(input) => void handleImport(input)} />
      <ImportProgress phase={phase} detail={phaseDetail} />

      <section className="import-list-section" aria-label="Imported projects">
        <h2>Imported projects{importedCount > 0 ? ` (${importedCount})` : ''}</h2>
        {listError ? (
          <p className="notice import-list-error" role="alert">
            {listError}
          </p>
        ) : null}
        {imports === null ? (
          <p className="notice">Loading imported projects…</p>
        ) : (
          <ImportList
            imports={imports}
            busyId={busyId}
            onRefresh={(id) => void handleRefresh(id)}
            onRemove={(id) => void handleRemove(id)}
          />
        )}
      </section>
    </div>
  );
}
