import { useEffect } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/react-router';
import { HomePage } from './routes/HomePage.js';
import { PlayerPage } from './routes/PlayerPage.js';
import { CodePage } from './routes/CodePage.js';
import { ImportPage } from './routes/ImportPage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { SettingsPage } from './routes/SettingsPage.js';
import { AccountPage } from './routes/AccountPage.js';
import { SyncBadge } from './components/account/SyncBadge.js';
import { ReviewPage } from './routes/ReviewPage.js';
import { NewTourPage } from './routes/NewTourPage.js';
import { LocaleSwitcher } from './components/LocaleSwitcher.js';
import { useLocale } from './i18n/locale.js';
import { parsePlayerView } from './lib/player-view.js';

function RootLayout() {
  const { t } = useLocale();

  const path = useRouterState({ select: (state) => state.location.pathname });
  const pageTitles: Record<string, string> = {
    settings: t('shell.settings'),
    new: t('new.title'),
    import: 'Import a repository',
    account: 'Account',
    review: 'Review',
    t: t('canvas.viewLabel'),
    p: t('code.sourceLabel'),
    '': t('home.chapterIndex'),
  };
  const title = pageTitles[path.split('/')[1] ?? ''] ?? 'Page not found';
  useEffect(() => {
    document.title = `${title} · Sóþspell`;
  }, [title]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('shell.skip')}
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">sóþspell</span>
          <span className="brand-sub">{t('shell.tagline')}</span>
        </Link>
        <div className="topbar-meta">
          <LocaleSwitcher />
          <Link to="/new" className="topbar-link">
            {t('shell.newTour')}
          </Link>
          <Link to="/settings" className="topbar-link">
            {t('shell.settings')}
          </Link>
          <SyncBadge />
          <span className="mono">phase 1</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$tourId/$beatId',
  validateSearch: (search: Record<string, unknown>) => ({
    view: parsePlayerView(search.view),
  }),
  component: PlayerPage,
});

const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId/source/$',
  validateSearch: (search: Record<string, unknown>) => ({
    anchor: typeof search.anchor === 'string' ? search.anchor : undefined,
    beat: typeof search.beat === 'string' ? search.beat : undefined,
    tourId: typeof search.tourId === 'string' ? search.tourId : undefined,
    view: parsePlayerView(search.view),
  }),
  component: CodePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new',
  component: NewTourPage,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: ImportPage,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review/$tourId',
  component: ReviewPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  settingsRoute,
  newRoute,
  importRoute,
  playerRoute,
  codeRoute,
  accountRoute,
  reviewRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

export {
  accountRoute,
  codeRoute,
  homeRoute,
  importRoute,
  newRoute,
  playerRoute,
  reviewRoute,
  settingsRoute,
};

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
