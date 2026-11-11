import { Outlet, ScrollRestoration } from 'react-router';
import { Header } from './Header';
import { VerifyBanner } from './VerifyBanner';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header />
      <VerifyBanner />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-xs text-stone-500 sm:flex-row sm:justify-between">
          <p>CoopSwap is a student project. We don't verify listings, identities, or leases. Meet, ask questions, and get things in writing.</p>
          <p>Not affiliated with or endorsed by Northeastern University.</p>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
