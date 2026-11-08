import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ENGINES,
  STAGES,
  type Competitor,
  type EngineId,
  type Prompt,
  type Stage,
  type WorkspaceSettings,
} from './api';
import { engineLabel } from './format';
import { href } from './route';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

const MAX_COMPETITORS = 10;
const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function BrandForm({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: WorkspaceSettings;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [aliases, setAliases] = useState(initial.brand.aliases.join(', '));
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    void run(async () => {
      await api.saveSettings(workspaceId, {
        ...settings,
        country: settings.country?.trim() || undefined,
        brand: { ...settings.brand, aliases: splitList(aliases) },
      });
      setSaved(true);
      onSaved();
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <label>
          Workspace name
          <input
            value={settings.name}
            onChange={(event) => setSettings({ ...settings, name: event.target.value })}
            required
          />
        </label>
        <label className="narrow">
          Country
          <input
            value={settings.country ?? ''}
            maxLength={2}
            onChange={(event) => setSettings({ ...settings, country: event.target.value })}
          />
        </label>
      </div>
      <div className="row">
        <label>
          Brand name
          <input
            value={settings.brand.name}
            onChange={(event) =>
              setSettings({ ...settings, brand: { ...settings.brand, name: event.target.value } })
            }
            required
          />
        </label>
        <label>
          Domain
          <input
            value={settings.brand.domain}
            onChange={(event) =>
              setSettings({ ...settings, brand: { ...settings.brand, domain: event.target.value } })
            }
            required
          />
        </label>
      </div>
      <label>
        Other names buyers use
        <input
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
          placeholder="Comma separated"
        />
      </label>
      <fieldset>
        <legend>Engines</legend>
        {ENGINES.map((engine) => (
          <label key={engine} className="check">
            <input
              type="checkbox"
              checked={settings.engines.includes(engine)}
              onChange={() => toggleEngine(engine)}
            />
            {engineLabel(engine)}
            {engine === 'fake' && <small className="muted"> canned answers, free</small>}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <label className="narrow">
          Samples per prompt
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
        <label>
          Schedule
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
            <option value="off">Only when I click Run now</option>
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">Saved.</p>}
      <button className="primary" disabled={busy || !settings.engines.length}>
        Save settings
      </button>
    </form>
  );
}

function CompetitorEditor({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: Competitor[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(
    initial.map((competitor) => ({ ...competitor, aliasText: competitor.aliases.join(', ') })),
  );
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(
      initial.map((competitor) => ({ ...competitor, aliasText: competitor.aliases.join(', ') })),
    );
  }, [initial]);

  function update(index: number, change: Partial<(typeof rows)[number]>) {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...change } : row)),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    void run(async () => {
      await api.saveCompetitors(
        workspaceId,
        rows
          .filter((row) => row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            domain: row.domain?.trim() || undefined,
            aliases: splitList(row.aliasText),
          })),
      );
      setSaved(true);
      onSaved();
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <table className="edit-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Domain</th>
            <th scope="col">Other names</th>
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                <input
                  aria-label="Name"
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label="Domain"
                  value={row.domain ?? ''}
                  onChange={(event) => update(index, { domain: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label="Other names"
                  value={row.aliasText}
                  onChange={(event) => update(index, { aliasText: event.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    setRows((current) => current.filter((_, position) => position !== index))
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-actions">
        <button
          type="button"
          disabled={rows.length >= MAX_COMPETITORS}
          onClick={() =>
            setRows((current) => [...current, { name: '', domain: '', aliases: [], aliasText: '' }])
          }
        >
          Add competitor
        </button>
        <span className="muted small">
          {rows.length} of {MAX_COMPETITORS}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">Saved.</p>}
      <button className="primary" disabled={busy}>
        Save competitors
      </button>
    </form>
  );
}

function PromptRow({
  workspaceId,
  prompt,
  onChanged,
}: {
  workspaceId: string;
  prompt: Prompt;
  onChanged: () => void;
}) {
  const [text, setText] = useState(prompt.text);
  const [stage, setStage] = useState<Stage>(prompt.stage);
  const { busy, error, run } = useAction();
  const dirty = text !== prompt.text || stage !== prompt.stage;

  return (
    <li className={prompt.active ? 'prompt-row' : 'prompt-row inactive'}>
      <input aria-label="Prompt" value={text} onChange={(event) => setText(event.target.value)} />
      <select
        aria-label="Stage"
        value={stage}
        onChange={(event) => setStage(event.target.value as Stage)}
      >
        {STAGES.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <div className="prompt-actions">
        {dirty && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.updatePrompt(workspaceId, { ...prompt, text, stage });
                onChanged();
              })
            }
          >
            Save
          </button>
        )}
        <button
          className="link-button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.updatePrompt(workspaceId, { ...prompt, active: !prompt.active });
              onChanged();
            })
          }
        >
          {prompt.active ? 'Pause' : 'Resume'}
        </button>
        <button
          className="link-button danger"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.deletePrompt(workspaceId, prompt.promptId);
              onChanged();
            })
          }
        >
          Delete
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

function PromptEditor({
  workspaceId,
  prompts,
  onChanged,
}: {
  workspaceId: string;
  prompts: Prompt[];
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('problem');
  const [suggestions, setSuggestions] = useState<{ text: string; stage: Stage }[]>([]);
  const add = useAction();
  const suggest = useAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void add.run(async () => {
      await api.addPrompt(workspaceId, { text: text.trim(), stage, active: true });
      setText('');
      onChanged();
    });
  }

  function accept(suggestion: { text: string; stage: Stage }) {
    void add.run(async () => {
      await api.addPrompt(workspaceId, { ...suggestion, active: true });
      setSuggestions((current) => current.filter((item) => item !== suggestion));
      onChanged();
    });
  }

  return (
    <div className="stack">
      <p className="muted small">
        Write questions the way a buyer would, before they know your name. Prompts that name your
        brand are rejected. {prompts.length} of 50 used.
      </p>
      <ul className="prompt-list">
        {prompts.map((prompt) => (
          <PromptRow
            key={`${prompt.promptId}-${prompt.text}-${prompt.active}`}
            workspaceId={workspaceId}
            prompt={prompt}
            onChanged={onChanged}
          />
        ))}
      </ul>
      <form className="prompt-add" onSubmit={submit}>
        <input
          aria-label="New prompt"
          value={text}
          placeholder="What's the easiest way to invoice international clients?"
          onChange={(event) => setText(event.target.value)}
          required
          minLength={8}
        />
        <select
          aria-label="Stage"
          value={stage}
          onChange={(event) => setStage(event.target.value as Stage)}
        >
          {STAGES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <button className="primary" disabled={add.busy}>
          Add prompt
        </button>
      </form>
      {add.error && <p className="error">{add.error}</p>}
      <div className="suggest">
        <button
          disabled={suggest.busy}
          onClick={() =>
            suggest.run(async () =>
              setSuggestions((await api.suggestPrompts(workspaceId)).suggestions),
            )
          }
        >
          {suggest.busy ? 'Reading your site' : 'Suggest prompts from my site'}
        </button>
        {suggest.error && <p className="error">{suggest.error}</p>}
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion.text}>
                <span>
                  {suggestion.text} <span className="stage">{suggestion.stage}</span>
                </span>
                <button
                  className="link-button"
                  disabled={add.busy}
                  onClick={() => accept(suggestion)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SettingsPage({ workspaceId }: { workspaceId: string }) {
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  if (view.error) {
    return <p className="error">{view.error}</p>;
  }
  if (!view.data) {
    return <p className="muted">Loading</p>;
  }
  const { workspace, competitors, prompts } = view.data;
  return (
    <div className="settings">
      <a className="back" href={href.workspace(workspaceId)}>
        Back to {workspace.name}
      </a>
      <h1>Settings</h1>
      <section className="section">
        <h2>Brand and engines</h2>
        <BrandForm
          key={workspace.workspaceId}
          workspaceId={workspaceId}
          initial={{
            name: workspace.name,
            brand: workspace.brand,
            country: workspace.country,
            engines: workspace.engines,
            samples: workspace.samples,
            schedule: workspace.schedule,
          }}
          onSaved={view.reload}
        />
      </section>
      <section className="section">
        <h2>Competitors</h2>
        <CompetitorEditor workspaceId={workspaceId} initial={competitors} onSaved={view.reload} />
      </section>
      <section className="section">
        <h2>Prompts</h2>
        <PromptEditor workspaceId={workspaceId} prompts={prompts} onChanged={view.reload} />
      </section>
    </div>
  );
}
