import { useState, type FormEvent } from 'react';
import { href } from '../app/routes';
import { EmptyState, ErrorText, Loading } from '../components/Feedback';
import { api } from '../lib/api';
import { splitList } from '../lib/format';
import { useAction } from '../lib/hooks/useAction';
import { useLoad } from '../lib/hooks/useLoad';

export function Workspaces() {
  const workspaces = useLoad(() => api.workspaces(), []);
  const [brandName, setBrandName] = useState('');
  const [domain, setDomain] = useState('');
  const [aliases, setAliases] = useState('');
  const [country, setCountry] = useState('US');
  const { busy, error, run } = useAction();

  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { workspace } = await api.createWorkspace({
        name: brandName.trim(),
        brand: { name: brandName.trim(), domain: domain.trim(), aliases: splitList(aliases) },
        country: country.trim() || undefined,
        engines: ['openai', 'nova', 'sonar'],
        samples: 3,
        schedule: 'weekly',
        digest: true,
        competitors: [],
      });
      window.location.hash = href.settings(workspace.workspaceId);
    });
  }

  return (
    <div className="workspaces">
      <section>
        <h1>Your brands</h1>
        <p className="lede">Each workspace tracks one brand against its competitors.</p>
        {workspaces.loading && !workspaces.data && <Loading />}
        <ErrorText message={workspaces.error} />
        {workspaces.data && !workspaces.data.workspaces.length && (
          <EmptyState title="No workspaces yet">
            Add the brand you want to track on the right.
          </EmptyState>
        )}
        <ul className="workspace-list">
          {workspaces.data?.workspaces.map((workspace) => (
            <li key={workspace.workspaceId}>
              <a href={href.workspace(workspace.workspaceId)}>
                <span className="workspace-name">{workspace.name}</span>
                <span className="workspace-domain">{workspace.brand.domain}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <form className="panel create-workspace" onSubmit={create}>
        <h2>Track a new brand</h2>
        <label className="field">
          <span>Brand name</span>
          <input
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Website</span>
          <input
            value={domain}
            placeholder="example.com"
            onChange={(event) => setDomain(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Other names buyers use</span>
          <input
            value={aliases}
            placeholder="Comma separated, optional"
            onChange={(event) => setAliases(event.target.value)}
          />
        </label>
        <label className="field field-narrow">
          <span>Buyers' country</span>
          <input
            value={country}
            maxLength={2}
            onChange={(event) => setCountry(event.target.value)}
          />
        </label>
        <ErrorText message={error} />
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Creating' : 'Create workspace'}
        </button>
      </form>
    </div>
  );
}
