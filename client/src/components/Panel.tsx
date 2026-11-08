import type { ReactNode } from 'react';

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      {(title || aside) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="panel-aside">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
