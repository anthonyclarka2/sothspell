import { useState } from 'react';
import { deleteAccount } from '../../lib/account-api.js';

export interface DeleteAccountPanelProps {
  login: string;
  onDeleted: () => void;
}

/**
 * Deletion is irreversible, so it asks for the GitHub login as confirmation
 * instead of a single click. The server revokes every session and removes the
 * runs; the button is disabled until the typed login matches exactly.
 */
export function DeleteAccountPanel({ login, onDeleted }: DeleteAccountPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (confirmation !== login || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onDeleted();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'The account could not be deleted.',
      );
      setBusy(false);
    }
  };

  return (
    <section className="account-card account-danger" aria-label="Delete account">
      <h2>Delete account</h2>
      <p>
        This removes the account, revokes every session, and deletes all synced runs.
        Exported copies you already downloaded are not affected.
      </p>
      {!confirming ? (
        <button
          type="button"
          className="danger-action"
          onClick={() => setConfirming(true)}
        >
          Delete account…
        </button>
      ) : (
        <div className="delete-confirm">
          <label className="account-field">
            <span>
              Type <code>{login}</code> to confirm
            </span>
            <input
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="delete-confirm-actions">
            <button
              type="button"
              className="danger-action"
              onClick={() => void submit()}
              disabled={confirmation !== login || busy}
            >
              {busy ? 'Deleting…' : 'Delete account and all runs'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setConfirming(false);
                setConfirmation('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="account-error">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
