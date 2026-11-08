import { useState, type FormEvent } from 'react';
import { useWorkspace } from '../../app/workspace';
import { ErrorText } from '../../components/Feedback';
import { api, STAGES, type Prompt, type Stage } from '../../lib/api';
import { useAction } from '../../lib/hooks/useAction';

const MAX_PROMPTS = 50;

function PromptRow({ prompt }: { prompt: Prompt }) {
  const { workspaceId, reload } = useWorkspace();
  const [text, setText] = useState(prompt.text);
  const [stage, setStage] = useState<Stage>(prompt.stage);
  const { busy, error, run } = useAction();
  const dirty = text !== prompt.text || stage !== prompt.stage;
  const act = (action: () => Promise<unknown>) =>
    run(async () => {
      await action();
      reload();
    });

  return (
    <li className={prompt.active ? 'prompt-row' : 'prompt-row is-paused'}>
      <input
        aria-label="Buyer question"
        value={text}
        onChange={(event) => setText(event.target.value)}
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
      <div className="prompt-actions">
        {dirty && (
          <button
            className="button button-small"
            disabled={busy}
            onClick={() => act(() => api.updatePrompt(workspaceId, { ...prompt, text, stage }))}
          >
            Save
          </button>
        )}
        <button
          className="link-button"
          disabled={busy}
          onClick={() =>
            act(() => api.updatePrompt(workspaceId, { ...prompt, active: !prompt.active }))
          }
        >
          {prompt.active ? 'Pause' : 'Resume'}
        </button>
        <button
          className="link-button link-danger"
          disabled={busy}
          onClick={() => act(() => api.deletePrompt(workspaceId, prompt.promptId))}
        >
          Delete
        </button>
      </div>
      <ErrorText message={error} />
    </li>
  );
}

export function PromptEditor() {
  const { workspaceId, workspace, prompts, reload } = useWorkspace();
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
      reload();
    });
  }

  function accept(suggestion: { text: string; stage: Stage }) {
    void add.run(async () => {
      await api.addPrompt(workspaceId, { ...suggestion, active: true });
      setSuggestions((current) => current.filter((item) => item !== suggestion));
      reload();
    });
  }

  return (
    <div className="form">
      <p className="section-intro">
        Write each question the way a buyer would type it before they know {workspace.brand.name}.
        Questions that name your brand are rejected. {prompts.length} of {MAX_PROMPTS} used.
      </p>
      {prompts.length > 0 && (
        <ul className="prompt-list">
          {prompts.map((prompt) => (
            <PromptRow
              key={`${prompt.promptId}-${prompt.text}-${prompt.stage}-${prompt.active}`}
              prompt={prompt}
            />
          ))}
        </ul>
      )}
      <form className="prompt-add" onSubmit={submit}>
        <input
          aria-label="New buyer question"
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
        <button
          className="button button-primary"
          disabled={add.busy || prompts.length >= MAX_PROMPTS}
        >
          Add question
        </button>
      </form>
      <ErrorText message={add.error} />
      <div className="suggest">
        <button
          className="button"
          disabled={suggest.busy}
          onClick={() =>
            suggest.run(async () =>
              setSuggestions((await api.suggestPrompts(workspaceId)).suggestions),
            )
          }
        >
          {suggest.busy ? 'Reading your site' : 'Suggest questions from my site'}
        </button>
        <ErrorText message={suggest.error} />
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion.text}>
                <span>
                  {suggestion.text} <span className="chip">{suggestion.stage}</span>
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
