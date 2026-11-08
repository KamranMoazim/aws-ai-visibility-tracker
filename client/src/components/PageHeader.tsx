import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  back,
  serif = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  serif?: boolean;
}) {
  return (
    <header className="page-header">
      {back && (
        <a className="back-link" href={back.href}>
          {back.label}
        </a>
      )}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1 className={serif ? 'title-serif' : undefined}>{title}</h1>
          {description && <div className="page-description">{description}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
