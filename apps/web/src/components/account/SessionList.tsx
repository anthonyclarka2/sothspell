import type { AccountSessionSummary } from '../../lib/account-api.js';

function formatMoment(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export interface SessionListProps {
  sessions: AccountSessionSummary[];
  currentSessionId?: string;
}

/** The device list: one row per live session row on the server. */
export function SessionList({ sessions, currentSessionId }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="account-muted">No active sessions.</p>;
  }

  return (
    <ul className="session-list">
      {sessions.map((session) => (
        <li className="session-item" key={session.id}>
          <div className="session-device">
            <strong>{session.userAgent ?? 'Unknown device'}</strong>
            {session.id === currentSessionId ? (
              <span className="session-current">this device</span>
            ) : null}
          </div>
          <span className="account-muted">
            Signed in {formatMoment(session.createdAt)} · last seen{' '}
            {formatMoment(session.lastSeenAt)} · expires {formatMoment(session.expiresAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
