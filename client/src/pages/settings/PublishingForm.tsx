import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../../app/workspace';
import { ErrorText } from '../../components/Feedback';
import { api, type WordPressSettings } from '../../lib/api';
import { useAction } from '../../lib/hooks/useAction';
import { settingsOf } from './BrandForm';

export function PublishingForm() {
  const { workspaceId, workspace, reload } = useWorkspace();
  const [wordpress, setWordpress] = useState<WordPressSettings>(
    workspace.wordpress ?? { siteUrl: '', username: '', postStatus: 'draft' },
  );
  const { busy, error, ran, run } = useAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.saveSettings(workspaceId, {
        ...settingsOf(workspace),
        wordpress: wordpress.siteUrl.trim()
          ? { ...wordpress, siteUrl: wordpress.siteUrl.trim() }
          : undefined,
      });
      reload();
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="section-intro">
        Pages publish to /guides on this site by default. To publish to WordPress instead, add your
        site and an application password. Store the password with scripts/set-keys.sh; it never
        passes through this page.
      </p>
      <div className="form-row">
        <label className="field">
          <span>WordPress site</span>
          <input
            value={wordpress.siteUrl}
            placeholder="https://blog.example.com"
            onChange={(event) => setWordpress({ ...wordpress, siteUrl: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            value={wordpress.username}
            onChange={(event) => setWordpress({ ...wordpress, username: event.target.value })}
          />
        </label>
        <label className="field field-narrow">
          <span>Post as</span>
          <select
            value={wordpress.postStatus}
            onChange={(event) =>
              setWordpress({ ...wordpress, postStatus: event.target.value as 'draft' | 'publish' })
            }
          >
            <option value="draft">Draft</option>
            <option value="publish">Published</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="button button-primary" disabled={busy}>
          Save publishing
        </button>
        {ran && !busy && !error && <span className="saved">Saved</span>}
      </div>
      <ErrorText message={error} />
    </form>
  );
}
