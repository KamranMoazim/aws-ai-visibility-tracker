import type { ReactNode } from 'react';

export function Notice({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'error' | 'ok';
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="loading-bar" aria-hidden="true" />
      {label}
    </p>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  return message ? (
    <p className="error-text" role="alert">
      {message}
    </p>
  ) : null;
}
