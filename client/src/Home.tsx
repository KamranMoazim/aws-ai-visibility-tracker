import { useState, type FormEvent } from 'react';
import { api } from './api';
import { href } from './route';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function Home() {
  const workspaces = useLoad(() => api.workspaces(), []);
  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [domain, setDomain] = useState('');
  const [aliases, setAliases] = useState('');
  const [country, setCountry] = useState('US');
  const { busy, error, run } = useAction();

  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { workspace } = await api.createWorkspace({
        name: name.trim() || brandName.trim(),
        brand: { name: brandName.trim(), domain: domain.trim(), aliases: splitList(aliases) },
        country: country.trim() || undefined,
        engines: ['openai', 'nova', 'sonar'],
        samples: 3,
        schedule: 'weekly',
        competitors: [],
      });
      window.location.hash = href.settings(workspace.workspaceId);
    });
  }

  return (
    <div className="home">
      <section>
        <h1>Workspaces</h1>
        {workspaces.loading && <p className="muted">Loading</p>}
        {workspaces.error && <p className="error">{workspaces.error}</p>}
        {workspaces.data && !workspaces.data.workspaces.length && (
          <p className="empty">Create a workspace for the brand you want to track.</p>
        )}
        <ul className="workspace-list">
          {workspaces.data?.workspaces.map((workspace) => (
            <li key={workspace.workspaceId}>
              <a href={href.workspace(workspace.workspaceId)}>
                <strong>{workspace.name}</strong>
                <span>{workspace.brand.domain}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>New workspace</h2>
        <form className="stack" onSubmit={create}>
          <label>
            Brand name
            <input
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              required
            />
          </label>
          <label>
            Domain
            <input
              value={domain}
              placeholder="example.com"
              onChange={(event) => setDomain(event.target.value)}
              required
            />
          </label>
          <label>
            Other names buyers use
            <input
              value={aliases}
              placeholder="Comma separated, optional"
              onChange={(event) => setAliases(event.target.value)}
            />
          </label>
          <div className="row">
            <label>
              Workspace name
              <input
                value={name}
                placeholder="Defaults to the brand"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="narrow">
              Country
              <input
                value={country}
                maxLength={2}
                onChange={(event) => setCountry(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Creating' : 'Create workspace'}
          </button>
        </form>
      </section>
    </div>
  );
}
