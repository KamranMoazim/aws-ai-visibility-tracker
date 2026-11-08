import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../../app/workspace';
import { ErrorText } from '../../components/Feedback';
import { api } from '../../lib/api';
import { splitList } from '../../lib/format';
import { useAction } from '../../lib/hooks/useAction';

const MAX_COMPETITORS = 10;

export function CompetitorEditor() {
  const { workspaceId, competitors, reload } = useWorkspace();
  const [rows, setRows] = useState(() =>
    competitors.map((competitor) => ({ ...competitor, aliasText: competitor.aliases.join(', ') })),
  );
  const { busy, error, ran, run } = useAction();

  function update(index: number, change: Partial<(typeof rows)[number]>) {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...change } : row)),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
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
      reload();
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="edit-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Website</th>
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
                      aria-label="Website"
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
                      className="link-button link-danger"
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
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="button"
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
      <div className="form-actions">
        <button className="button button-primary" disabled={busy}>
          Save competitors
        </button>
        {ran && !busy && !error && <span className="saved">Saved</span>}
      </div>
      <ErrorText message={error} />
    </form>
  );
}
