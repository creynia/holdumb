import type { ComponentChildren } from 'preact';
import { UpdateToast } from '../../pwa/UpdateToast';
import { Link } from './Link';

/** D4: Learn · Play · Drill · More. Strategy charts are not a tab. */
export const TABS = [
  { to: '/learn', label: 'Learn', icon: '♠', match: (p: string) => p.startsWith('/learn') },
  { to: '/play', label: 'Play', icon: '⚅', match: (p: string) => p.startsWith('/play') },
  { to: '/drill', label: 'Drill', icon: '◎', match: (p: string) => p.startsWith('/drill') },
  {
    to: '/more',
    label: 'More',
    icon: '≡',
    match: (p: string) => /^\/(more|strategy|hands|bets|glossary|settings|sources|about)/.test(p),
  },
];

export function Shell(props: {
  path: string;
  banner?: ComponentChildren;
  /** Extra top-bar notice (error toast); lives in the top bar row like UpdateToast. */
  toast?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="shell">
      <a
        class="skip-link"
        href="#main"
        onClick={(e) => {
          // Hash routing: keep the route, just move focus to the content.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header class="topbar">
        <Link to="/" class="brand">
          holdumb
        </Link>
        <nav class="topnav" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} aria-current={t.match(props.path) ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <UpdateToast />
        {props.toast}
      </header>
      {props.banner}
      <main id="main" tabIndex={-1}>
        {props.children}
      </main>
      <nav class="tabbar" aria-label="Tabs">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} aria-current={t.match(props.path) ? 'page' : undefined}>
            <span class="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
