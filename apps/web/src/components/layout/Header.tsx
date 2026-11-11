import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import clsx from 'clsx';
import { useSession, useSignOut } from '@/hooks/session';
import { useUnread } from '@/hooks/data';
import { useRealtime } from '@/hooks/realtime';
import { Avatar } from '@/components/ui/misc';
import { ButtonLink } from '@/components/ui/Button';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-stone-900">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      </span>
      CoopSwap
    </Link>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx('relative rounded-full px-3 py-2 text-sm font-medium', isActive ? 'text-stone-900' : 'text-stone-600 hover:text-stone-900');

function Dot({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Header() {
  const { user } = useSession();
  const { data: unread } = useUnread(!!user);
  const { connected } = useRealtime();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink to="/explore" className={navClass}>
            Explore
          </NavLink>
          {user && (
            <>
              <NavLink to="/bookings" className={navClass}>
                Bookings
              </NavLink>
              <NavLink to="/messages" className={navClass}>
                Messages
                <Dot n={unread?.messages} />
              </NavLink>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <ButtonLink to="/listings/new" variant="secondary" size="sm" className="hidden sm:inline-flex">
                List your place
              </ButtonLink>
              <Link to="/notifications" className="relative rounded-full p-2 text-stone-600 hover:bg-stone-100" aria-label={`Notifications${unread?.notifications ? `, ${unread.notifications} unread` : ''}`}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <Dot n={unread?.notifications} />
              </Link>
              <div className="relative">
                <button
                  className="flex items-center gap-2 rounded-full border border-stone-200 p-1 pr-3 hover:shadow-sm"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu((m) => !m)}
                  onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setMenu(false)}
                >
                  <Avatar name={user.displayName} size="sm" />
                  <span className={clsx('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-stone-300')} title={connected ? 'Live' : 'Reconnecting'} />
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-lg">
                    {[
                      ['/profile', 'Profile'],
                      ['/profile#listings', 'My listings'],
                      ['/bookings', 'Bookings'],
                      ['/messages', 'Messages'],
                      ['/settings', 'Settings'],
                    ].map(([to, label]) => (
                      <Link key={to} role="menuitem" to={to!} className="block px-4 py-2 hover:bg-stone-50" onClick={() => setMenu(false)}>
                        {label}
                      </Link>
                    ))}
                    <button
                      role="menuitem"
                      className="block w-full border-t border-stone-100 px-4 py-2 text-left text-stone-600 hover:bg-stone-50"
                      onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/') })}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <ButtonLink to="/signin" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
