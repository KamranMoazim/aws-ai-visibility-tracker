import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../../app/workspace';
import { ErrorText } from '../../components/Feedback';
import { api, ENGINES, type EngineId, type WorkspaceSettings } from '../../lib/api';
import { engineLabel, splitList } from '../../lib/format';
import { useAction } from '../../lib/hooks/useAction';

export function settingsOf(workspace: WorkspaceSettings): WorkspaceSettings {
  return {
    name: workspace.name,
    brand: workspace.brand,
    country: workspace.country,
    engines: workspace.engines,
    samples: workspace.samples,
    schedule: workspace.schedule,
    wordpress: workspace.wordpress,
    digest: workspace.digest ?? true,
  };
}

export function BrandForm() {
  const { workspaceId, workspace, reload } = useWorkspace();
  const [settings, setSettings] = useState(() => settingsOf(workspace));
  const [aliases, setAliases] = useState(workspace.brand.aliases.join(', '));
  const { busy, error, ran, run } = useAction();

  function toggleEngine(engine: EngineId) {
    setSettings((current) => ({
      ...current,
      engines: current.engines.includes(engine)
        ? current.engines.filter((item) => item !== engine)
        : [...current.engines, engine],
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.saveSettings(workspaceId, {
        ...settings,
        country: settings.country?.trim() || undefined,
        brand: { ...settings.brand, aliases: splitList(aliases) },
      });
      reload();
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span>Brand name</span>
          <input
            value={settings.brand.name}
            onChange={(event) =>
              setSettings({ ...settings, brand: { ...settings.brand, name: event.target.value } })
            }
            required
          />
        </label>
        <label className="field">
          <span>Website</span>
          <input
            value={settings.brand.domain}
            onChange={(event) =>
              setSettings({ ...settings, brand: { ...settings.brand, domain: event.target.value } })
            }
            required
          />
        </label>
      </div>
      <label className="field">
        <span>Other names buyers use</span>
        <input
          value={aliases}
          placeholder="Comma separated"
          onChange={(event) => setAliases(event.target.value)}
        />
        <small>
          Prompts that contain any of these are rejected, and answers that use them count as yours.
        </small>
      </label>
      <div className="form-row">
        <label className="field">
          <span>Workspace name</span>
          <input
            value={settings.name}
            onChange={(event) => setSettings({ ...settings, name: event.target.value })}
            required
          />
        </label>
        <label className="field field-narrow">
          <span>Buyers' country</span>
          <input
            value={settings.country ?? ''}
            maxLength={2}
            onChange={(event) => setSettings({ ...settings, country: event.target.value })}
          />
        </label>
      </div>
      <fieldset className="choice-group">
        <legend>Engines to ask</legend>
        {ENGINES.map((engine) => (
          <label key={engine} className="choice">
            <input
              type="checkbox"
              checked={settings.engines.includes(engine)}
              onChange={() => toggleEngine(engine)}
            />
            <span>
              {engineLabel(engine)}
              {engine === 'fake' && <small> canned answers, free, for testing</small>}
              {engine === 'nova' && <small> Bedrock, no extra key</small>}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-row">
        <label className="field field-narrow">
          <span>Samples per prompt</span>
          <select
            value={settings.samples}
            onChange={(event) => setSettings({ ...settings, samples: Number(event.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Schedule</span>
          <select
            value={settings.schedule}
            onChange={(event) =>
              setSettings({
                ...settings,
                schedule: event.target.value as WorkspaceSettings['schedule'],
              })
            }
          >
            <option value="weekly">Every Monday</option>
            <option value="off">Only when I press Run now</option>
          </select>
        </label>
      </div>
      <label className="choice">
        <input
          type="checkbox"
          checked={settings.digest ?? true}
          onChange={(event) => setSettings({ ...settings, digest: event.target.checked })}
        />
        <span>Email me a summary after each run</span>
      </label>
      <div className="form-actions">
        <button className="button button-primary" disabled={busy || !settings.engines.length}>
          Save settings
        </button>
        {ran && !busy && !error && <span className="saved">Saved</span>}
      </div>
      <ErrorText message={error} />
    </form>
  );
}
