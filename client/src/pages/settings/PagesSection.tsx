import { useEffect } from 'react';
import { useWorkspace } from '../../app/workspace';
import { ErrorText } from '../../components/Feedback';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks/useAction';
import { useLoad } from '../../lib/hooks/useLoad';

export function PagesSection() {
  const { workspaceId } = useWorkspace();
  const pages = useLoad(() => api.pages(workspaceId), [workspaceId]);
  const { busy, error, run } = useAction();
  const state = pages.data?.import;
  const active = Boolean(state && ['queued', 'running'].includes(state.status));

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(pages.reload, 5000);
    return () => clearInterval(timer);
  }, [active, pages.reload]);

  return (
    <div className="form">
      <p className="section-intro">
        Gap briefs compare the pages AI answers cite with your closest pages. Import your sitemap so
        they can find them: up to 500 pages, with titles read for the first 150.
      </p>
      <p>
        <strong>{pages.data ? pages.data.count : '...'}</strong> pages imported
        {state && (
          <span className="muted">
            {' '}
            (last import {state.status} {dateTime(state.at)}
            {state.error ? `: ${state.error}` : ''})
          </span>
        )}
      </p>
      <div className="form-actions">
        <button
          className="button"
          disabled={busy || active}
          onClick={() =>
            run(async () => {
              await api.importSitemap(workspaceId);
              pages.reload();
            })
          }
        >
          {active ? 'Importing' : 'Import sitemap.xml'}
        </button>
      </div>
      <ErrorText message={error} />
      {pages.data && pages.data.pages.length > 0 && (
        <details className="disclosure">
          <summary>Show imported pages</summary>
          <ul className="sources">
            {pages.data.pages.map((page) => (
              <li key={page.url}>
                <span>{page.title || page.url}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
