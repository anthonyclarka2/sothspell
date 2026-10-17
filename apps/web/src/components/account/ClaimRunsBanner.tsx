import { useEffect, useState } from 'react';
import { claimRuns } from '../../lib/account-api.js';
import { getOrCreateClientId, listRuns, type StoredRun } from '../../lib/run-store.js';

/**
 * Claiming anonymous runs is explicit (Phase 12 decision 5): nothing uploads
 * until the user presses the button, and dismissing it leaves the local runs
 * exactly where they were.
 */
export function ClaimRunsBanner() {
  const [localRuns, setLocalRuns] = useState<StoredRun[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'claiming' | 'claimed' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRuns()
      .then((runs) => {
        if (!cancelled) {
          setLocalRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalRuns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!localRuns || localRuns.length === 0 || status === 'claimed') {
    return null;
  }

  const claim = async () => {
    setStatus('claiming');
    setMessage(null);
    try {
      const result = await claimRuns(getOrCreateClientId());
      setStatus('claimed');
      setMessage(
        result.claimed === 0
          ? 'There was nothing left to attach.'
          : `Attached ${result.claimed} run${result.claimed === 1 ? '' : 's'} to your account.`,
      );
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'The runs could not be attached.',
      );
    }
  };

  return (
    <aside className="notice claim-banner" aria-label="Local progress">
      <span>
        This device has {localRuns.length} anonymous run
        {localRuns.length === 1 ? '' : 's'}. Attach them to your account?
      </span>
      <span className="claim-banner-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void claim()}
          disabled={status === 'claiming'}
        >
          {status === 'claiming' ? 'Attaching…' : 'Attach local progress'}
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => setLocalRuns([])}
        >
          Not now
        </button>
      </span>
      {message ? <span className="account-muted">{message}</span> : null}
    </aside>
  );
}
