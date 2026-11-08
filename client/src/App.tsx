import { useState } from 'react';
import { currentSession, signOut, type Session } from './auth';
import { AuthScreen } from './AuthScreen';
import { GapPage } from './GapPage';
import { GapsPage } from './GapsPage';
import { Home } from './Home';
import { PostPage } from './PostPage';
import { PostsPage } from './PostsPage';
import { PromptPage } from './PromptPage';
import { href, useHashRoute } from './route';
import { SettingsPage } from './SettingsPage';
import { WorkspacePage } from './WorkspacePage';

export function App() {
  const [session, setSession] = useState<Session | null>(currentSession());
  const route = useHashRoute();

  if (!session) {
    return <AuthScreen onSignedIn={setSession} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href={href.home()}>
          Answer<span>Share</span>
        </a>
        <div className="topbar-user">
          <span>{session.email}</span>
          <button
            className="link-button"
            onClick={() => {
              signOut();
              setSession(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        {route.page === 'home' && <Home />}
        {route.page === 'workspace' && <WorkspacePage workspaceId={route.workspaceId} />}
        {route.page === 'settings' && <SettingsPage workspaceId={route.workspaceId} />}
        {route.page === 'gaps' && <GapsPage workspaceId={route.workspaceId} />}
        {route.page === 'gap' && <GapPage workspaceId={route.workspaceId} gapId={route.gapId} />}
        {route.page === 'posts' && <PostsPage workspaceId={route.workspaceId} />}
        {route.page === 'post' && (
          <PostPage workspaceId={route.workspaceId} postId={route.postId} />
        )}
        {route.page === 'prompt' && (
          <PromptPage
            workspaceId={route.workspaceId}
            promptId={route.promptId}
            runId={route.runId}
          />
        )}
      </main>
    </div>
  );
}
