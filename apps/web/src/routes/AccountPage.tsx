import { useEffect, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import {
  accountExportUrl,
  fetchAccount,
  fetchSession,
  pullSync,
  signOut,
  syncLocalRuns,
} from '../lib/account-api.js';
import { listRuns } from '../lib/run-store.js';
import { useAsync } from '../lib/use-async.js';
import { ClaimRunsBanner } from '../components/account/ClaimRunsBanner.js';
import { DeleteAccountPanel } from '../components/account/DeleteAccountPanel.js';
import { SessionList } from '../components/account/SessionList.js';

/**
 * The `/account` page: sign-in, the signed-in state with device list and sync
 * status, export, and delete. The page is deliberately usable signed out —
 * local-first use never requires an account.
 */
export function AccountPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const [reloadToken, setReloadToken] = useState(0);
  const session = useAsync(() => fetchSession(), [reloadToken]);
  const signedIn = session.data?.signedIn === true;
  const account = useAsync(
    () => (signedIn ? fetchAccount() : Promise.resolve(null)),
    [signedIn, reloadToken],
  );

  const [localCount, setLocalCount] = useState<number | null>(null);
  const [remoteCount, setRemoteCount] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRuns()
      .then((runs) => {
        if (!cancelled) {
          setLocalCount(runs.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    pullSync()
      .then((pulled) => {
        if (!cancelled) {
          setRemoteCount(pulled.runs.length);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, reloadToken]);

  if (session.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">Loading account state…</p>
      </div>
    );
  }

  if (session.status === 'error' || !session.data) {
    return (
      <div className="page">
        <div className="notice" role="alert">
          <strong>The account state did not load.</strong> {session.error?.message}
          <button
            type="button"
            className="secondary-action"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const data = session.data;
  const user = data.user ?? account.data?.user ?? null;

  const notice = deletedNotice
    ? 'Your account, its sessions, and its runs were deleted.'
    : search.signedIn === '1'
      ? 'Signed in. Progress can now sync across devices.'
      : search.signin === 'error'
        ? 'GitHub sign-in did not complete. Try again.'
        : search.signin === 'denied'
          ? 'Sign-in was cancelled on GitHub.'
          : signedOutNotice;

  const handleSignOut = async () => {
    setSignedOutNotice(null);
    try {
      await signOut();
      setSignedOutNotice('Signed out. Local progress stays on this device.');
    } catch (error) {
      setSignedOutNotice(error instanceof Error ? error.message : 'Sign-out failed.');
    } finally {
      setReloadToken((token) => token + 1);
    }
  };

  const handleSync = async () => {
    setSyncBusy(true);
    setSyncMessage(null);
    try {
      const report = await syncLocalRuns();
      setRemoteCount(report.remoteRuns);
      setLocalCount(report.remoteRuns);
      setSyncMessage(
        `Synced: pulled ${report.pulled}, pushed ${report.pushed}, removed ${report.removed}.`,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="page account-page">
      <header className="account-header">
        <h1>Account</h1>
        <p>
          GitHub identity for cross-device run sync. Sóþspell stays local-first:
          everything here is optional and the tool keeps working signed out.
        </p>
      </header>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      {!data.signedIn ? (
        <section className="account-card" aria-label="Sign in">
          <h2>Sign in with GitHub</h2>
          <p>
            The <code>read:user</code> scope reads the public profile only — no email, no
            repository access. A signed session lives on the server with an httpOnly
            cookie.
          </p>
          {data.configured ? (
            <a className="primary-action" href="/api/auth/github">
              Sign in with GitHub
            </a>
          ) : (
            <div className="notice">
              <strong>GitHub sign-in is not configured.</strong> Set{' '}
              <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code>, then
              register this redirect URI on the OAuth app: <code>{data.redirectUri}</code>
            </div>
          )}
          <p className="account-muted">
            CLI: <code>sothspell account signin</code> uses the device flow.
          </p>
        </section>
      ) : (
        <>
          <section className="account-card account-profile" aria-label="Profile">
            {user?.avatarUrl ? (
              <img className="account-avatar" src={user.avatarUrl} alt="" />
            ) : (
              <span
                className="account-avatar account-avatar--placeholder"
                aria-hidden="true"
              >
                {(user?.login ?? '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="account-profile-name">
              <h2>{user?.name ?? user?.login ?? 'Signed in'}</h2>
              <p className="account-muted">@{user?.login ?? 'unknown'}</p>
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </section>

          {data.sessionSecretConfigured === false ? (
            <p className="notice">
              Sessions reset when the server restarts. Set{' '}
              <code>SOTHSPELL_SESSION_SECRET</code> to keep them.
            </p>
          ) : null}

          <ClaimRunsBanner />

          <section className="account-card" aria-label="Sync">
            <h2>Sync</h2>
            <dl className="sync-counts">
              <dt>Runs on this device</dt>
              <dd>{localCount ?? '—'}</dd>
              <dt>Runs on your account</dt>
              <dd>{remoteCount ?? '—'}</dd>
            </dl>
            <p className="account-muted">
              Newer position wins, completed beats are unioned, and deletions carry a
              tombstone so they do not come back.
            </p>
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleSync()}
              disabled={syncBusy}
            >
              {syncBusy ? 'Syncing…' : 'Sync now'}
            </button>
            {syncMessage ? (
              <p className="account-muted" role="status">
                {syncMessage}
              </p>
            ) : null}
          </section>

          <section className="account-card" aria-label="Devices">
            <h2>Devices</h2>
            <SessionList
              sessions={account.data?.sessions ?? []}
              currentSessionId={data.session?.id}
            />
          </section>

          <section className="account-card" aria-label="Export">
            <h2>Export</h2>
            <p>
              Download everything the account stores — profile, sessions, runs, and
              tombstones — as one JSON file.
            </p>
            <a
              className="secondary-action"
              href={accountExportUrl()}
              download="sothspell-account-export.json"
            >
              Download account export
            </a>
          </section>

          {user ? (
            <DeleteAccountPanel
              login={user.login}
              onDeleted={() => {
                setDeletedNotice(true);
                setReloadToken((token) => token + 1);
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
