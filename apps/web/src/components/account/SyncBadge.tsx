import { Link } from '@tanstack/react-router';
import { fetchSession } from '../../lib/account-api.js';
import { useAsync } from '../../lib/use-async.js';

/**
 * The topbar sync badge. It is visible on every screen including the player,
 * so a user can tell at a glance whether progress is account-backed or local
 * only, without opening the account page.
 */
export function SyncBadge() {
  const session = useAsync(() => fetchSession(), []);

  if (session.status !== 'ready' || !session.data) {
    return (
      <Link to="/account" className="sync-badge sync-badge--off">
        account
      </Link>
    );
  }

  if (session.data.signedIn && session.data.user) {
    return (
      <Link to="/account" className="sync-badge sync-badge--on">
        synced · {session.data.user.login}
      </Link>
    );
  }

  return (
    <Link to="/account" className="sync-badge sync-badge--off">
      local only
    </Link>
  );
}
