import { useState } from 'react';
import { currentSession, signOut, type Session } from '../lib/auth';
import { GapDetail } from '../pages/GapDetail';
import { GapsList } from '../pages/GapsList';
import { Overview } from '../pages/Overview';
import { PostEditor } from '../pages/PostEditor';
import { PostsList } from '../pages/PostsList';
import { PromptDetail } from '../pages/PromptDetail';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { SignIn } from '../pages/SignIn';
import { Workspaces } from '../pages/Workspaces';
import { Wordmark } from './Brand';
import { href, useHashRoute, type RouteView } from './routes';
import { WorkspaceLayout } from './WorkspaceLayout';

function WorkspacePage({ route }: { route: Exclude<RouteView, { page: 'home' }> }) {
  switch (route.page) {
    case 'workspace':
      return <Overview />;
    case 'prompt':
      return <PromptDetail promptId={route.promptId} runId={route.runId} />;
    case 'gaps':
      return <GapsList />;
    case 'gap':
      return <GapDetail gapId={route.gapId} />;
    case 'posts':
      return <PostsList />;
    case 'post':
      return <PostEditor postId={route.postId} />;
    case 'settings':
      return <SettingsPage />;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(currentSession());
  const route = useHashRoute();

  if (!session) {
    return <SignIn onSignedIn={setSession} />;
  }
  const leave = () => {
    signOut();
    setSession(null);
  };

  if (route.page === 'home') {
    return (
      <div className="frame">
        <header className="frame-bar">
          <a href={href.home()}>
            <Wordmark />
          </a>
          <div className="frame-user">
            <span>{session.email}</span>
            <button className="link-button" onClick={leave}>
              Sign out
            </button>
          </div>
        </header>
        <main className="frame-main">
          <Workspaces />
        </main>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      key={route.workspaceId}
      workspaceId={route.workspaceId}
      route={route}
      email={session.email}
      onSignOut={leave}
    >
      <WorkspacePage route={route} />
    </WorkspaceLayout>
  );
}
