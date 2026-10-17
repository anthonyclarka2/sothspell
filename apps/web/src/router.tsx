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
import { AccountPage } from './routes/AccountPage.js';
import { SyncBadge } from './components/account/SyncBadge.js';

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">sóþspell</span>
          <span className="brand-sub">truth story</span>
        </Link>
        <div className="topbar-meta">
          <SyncBadge />
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

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  playerRoute,
  codeRoute,
  accountRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

export { accountRoute, codeRoute, homeRoute, playerRoute };

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
