import { Link } from '@tanstack/react-router';
import { fetchSession } from '../../lib/account-api.js';
import { useAsync } from '../../lib/use-async.js';

/**
 * The home-page sign-in nudge. It only appears when GitHub sign-in is actually
 * configured and the visitor is signed out, so a local-only install is never
 * told to do something it cannot.
 */
export function SignInNudge() {
  const session = useAsync(() => fetchSession(), []);

  if (session.status !== 'ready' || !session.data) {
    return null;
  }
  if (!session.data.configured || session.data.signedIn) {
    return null;
  }

  return (
    <aside className="account-nudge" aria-label="Account">
      <div>
        <strong>Keep your progress across devices.</strong>{' '}
        <span>
          Sign in with GitHub to sync runs and sessions; Sóþspell keeps working locally
          without an account.
        </span>
      </div>
      <span className="account-nudge-actions">
        <a className="primary-action" href="/api/auth/github">
          Sign in with GitHub
        </a>
        <Link className="secondary-action" to="/account">
          Account
        </Link>
      </span>
    </aside>
  );
}
