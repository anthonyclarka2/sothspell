import { useState } from 'react';
import { ArrowsClockwise, Trash } from '@phosphor-icons/react';
import { formatBytes, type ImportRecord } from '../../lib/import-api.js';

export interface ImportListProps {
  imports: ImportRecord[];
  busyId: string | null;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
}

interface ImportListItemProps {
  record: ImportRecord;
  busy: boolean;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
}

function ImportListItem({ record, busy, onRefresh, onRemove }: ImportListItemProps) {
  const [confirming, setConfirming] = useState(false);
  const importedAt = new Date(record.importedAt);

  return (
    <li className="import-item" data-testid="import-item" data-import-id={record.id}>
      <div className="import-item-main">
        <h3>
          <a href={record.sourceUrl} target="_blank" rel="noreferrer">
            {record.owner}/{record.repo}
          </a>
        </h3>
        <div className="import-item-meta">
          <span>
            Revision <code className="mono">{record.shortCommit}</code>
          </span>
          {record.ref ? (
            <span>
              Ref <code className="mono">{record.ref}</code>
            </span>
          ) : null}
          <span>
            {formatBytes(record.sizeBytes)} · {record.fileCount.toLocaleString()} files
          </span>
          <span>Imported {importedAt.toLocaleDateString()}</span>
        </div>
      </div>
      <div className="import-item-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="danger-action"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onRemove(record.id);
              }}
            >
              Confirm remove
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={() => onRefresh(record.id)}
            >
              <ArrowsClockwise size={14} weight="bold" />
              Refresh
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <Trash size={14} weight="bold" />
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The imported-project list. Removal is two-step: the clone on disk is deleted
 * for real, so the destructive button only arms after an explicit confirm.
 */
export function ImportList({ imports, busyId, onRefresh, onRemove }: ImportListProps) {
  if (imports.length === 0) {
    return (
      <p className="notice" data-testid="import-empty">
        No imported projects yet. Paste a public GitHub URL above to clone one read-only.
      </p>
    );
  }

  return (
    <ul className="import-list">
      {imports.map((record) => (
        <ImportListItem
          key={record.id}
          record={record}
          busy={busyId === record.id}
          onRefresh={onRefresh}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}
