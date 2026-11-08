import { createContext, useContext, type ReactNode } from 'react';
import { api, type WorkspaceView } from '../lib/api';
import { useLoad } from '../lib/hooks/useLoad';

interface WorkspaceState extends WorkspaceView {
  workspaceId: string;
  reload: () => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const state = useContext(WorkspaceContext);
  if (!state) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return state;
}

export function WorkspaceProvider({
  workspaceId,
  children,
  fallback,
}: {
  workspaceId: string;
  children: ReactNode;
  fallback: (error: string | null) => ReactNode;
}) {
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  if (!view.data || view.data.workspace.workspaceId !== workspaceId) {
    return <>{fallback(view.error)}</>;
  }
  return (
    <WorkspaceContext.Provider value={{ ...view.data, workspaceId, reload: view.reload }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
