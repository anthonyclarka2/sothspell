import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { HomePage } from './routes/HomePage.js';
import { PlayerPage } from './routes/PlayerPage.js';
import { CodePage } from './routes/CodePage.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { SettingsPage } from './routes/SettingsPage.js';
import { LocaleSwitcher } from './components/LocaleSwitcher.js';
import { useLocale } from './i18n/locale.js';

function RootLayout() {
  const { t } = useLocale();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">sóþspell</span>
          <span className="brand-sub">{t('shell.tagline')}</span>
        </Link>
        <div className="topbar-meta">
          <LocaleSwitcher />
          <Link to="/settings" className="topbar-link">
            {t('shell.settings')}
          </Link>
          <span className="mono">phase 1</span>
        </div>
      </header>
      <main>
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
  component: PlayerPage,
});

const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId/source/$',
  validateSearch: (search: Record<string, unknown>) => ({
    anchor: typeof search.anchor === 'string' ? search.anchor : undefined,
    beat: typeof search.beat === 'string' ? search.beat : undefined,
  }),
  component: CodePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  settingsRoute,
  playerRoute,
  codeRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

export { codeRoute, homeRoute, playerRoute, settingsRoute };

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
