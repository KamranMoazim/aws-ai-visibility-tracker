import type { ReactNode } from 'react';
import { ErrorText, Loading } from '../components/Feedback';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks/useLoad';
import { Wordmark } from './Brand';
import { href, type RouteView } from './routes';
import { WorkspaceProvider } from './workspace';

type Section = 'overview' | 'gaps' | 'pages' | 'settings';

const SECTIONS: { id: Section; label: string; to: (workspaceId: string) => string }[] = [
  { id: 'overview', label: 'Overview', to: href.workspace },
  { id: 'gaps', label: 'Gaps', to: href.gaps },
  { id: 'pages', label: 'Pages', to: href.posts },
  { id: 'settings', label: 'Settings', to: href.settings },
];

function sectionOf(route: RouteView): Section {
  switch (route.page) {
    case 'gaps':
    case 'gap':
      return 'gaps';
    case 'posts':
    case 'post':
      return 'pages';
    case 'settings':
      return 'settings';
    default:
      return 'overview';
  }
}

export function WorkspaceLayout({
  workspaceId,
  route,
  email,
  onSignOut,
  children,
}: {
  workspaceId: string;
  route: RouteView;
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const workspaces = useLoad(() => api.workspaces(), []);
  const active = sectionOf(route);
  const current = workspaces.data?.workspaces.find((item) => item.workspaceId === workspaceId);

  return (
    <div className="layout">
      <aside className="sidebar">
        <a className="sidebar-brand" href={href.home()}>
          <Wordmark />
        </a>
        <label className="switcher">
          <span className="visually-hidden">Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => {
              window.location.hash = event.target.value
                ? href.workspace(event.target.value)
                : href.home();
            }}
          >
            {!current && <option value={workspaceId}>Loading</option>}
            {workspaces.data?.workspaces.map((item) => (
              <option key={item.workspaceId} value={item.workspaceId}>
                {item.name}
              </option>
            ))}
            <option value="">All workspaces</option>
          </select>
        </label>
        <nav className="nav" aria-label="Workspace">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={section.to(workspaceId)}
              className={active === section.id ? 'nav-link is-active' : 'nav-link'}
              aria-current={active === section.id ? 'page' : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-user" title={email}>
            {email}
          </span>
          <button className="link-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <WorkspaceProvider
          workspaceId={workspaceId}
          fallback={(error) =>
            error ? <ErrorText message={error} /> : <Loading label="Opening workspace" />
          }
        >
          {children}
        </WorkspaceProvider>
      </main>
    </div>
  );
}
