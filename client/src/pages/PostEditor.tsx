import { useEffect, useMemo, useState } from 'react';
import { href } from '../app/routes';
import { useWorkspace } from '../app/workspace';
import { ErrorText, Loading, Notice } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { WithPlaceholders } from '../components/Placeholders';
import { Panel } from '../components/Panel';
import { api, type CrawlerCheck, type FaqPair, type Post } from '../lib/api';
import { dateTime } from '../lib/format';
import { useAction } from '../lib/hooks/useAction';
import { useLoad } from '../lib/hooks/useLoad';
import { markdownToHtml, markPlaceholders } from '../lib/markdown';

const PLACEHOLDER = /\[fill in[^\]]*\]/gi;
const POLL_MS = 4000;
type Target = 'hosted' | 'wordpress';

function countPlaceholders(post: Pick<Post, 'title' | 'description' | 'markdown' | 'faq'>): number {
  return [
    post.title,
    post.description,
    post.markdown,
    ...post.faq.flatMap((pair) => [pair.question, pair.answer]),
  ]
    .map((field) => field.match(PLACEHOLDER)?.length ?? 0)
    .reduce((sum, count) => sum + count, 0);
}

function CrawlerStatus({ check }: { check: CrawlerCheck | null }) {
  if (!check) {
    return null;
  }
  const blocked = check.crawlers.filter((crawler) => !crawler.allowed);
  if (!blocked.length) {
    return (
      <p className="crawler-ok">
        AI search crawlers can read {check.domain}
        {check.path}.
      </p>
    );
  }
  return (
    <Notice tone="warn">
      robots.txt on {check.domain} blocks {blocked.map((crawler) => crawler.agent).join(' and ')}.
      AI search cannot cite this page until that changes.
    </Notice>
  );
}

export function PostEditor({ postId }: { postId: string }) {
  const { workspaceId, workspace } = useWorkspace();
  const loaded = useLoad(() => api.post(workspaceId, postId), [workspaceId, postId]);
  const [draft, setDraft] = useState<Post | null>(null);
  const [target, setTarget] = useState<Target>('hosted');
  const [crawler, setCrawler] = useState<CrawlerCheck | null>(null);
  const save = useAction();
  const publish = useAction();

  useEffect(() => {
    if (loaded.data) {
      setDraft(loaded.data.post);
    }
  }, [loaded.data]);

  const generating = loaded.data?.post.status === 'generating';
  useEffect(() => {
    if (!generating) {
      return;
    }
    const timer = setInterval(loaded.reload, POLL_MS);
    return () => clearInterval(timer);
  }, [generating, loaded.reload]);

  useEffect(() => {
    setCrawler(null);
    api
      .crawlerCheck(workspaceId, target)
      .then(setCrawler)
      .catch(() => setCrawler(null));
  }, [workspaceId, target]);

  const preview = useMemo(
    () => (draft ? markPlaceholders(markdownToHtml(draft.markdown).html) : ''),
    [draft],
  );
  const back = { href: href.posts(workspaceId), label: 'All pages' };

  if (loaded.error) {
    return <ErrorText message={loaded.error} />;
  }
  if (!loaded.data || !draft) {
    return <Loading />;
  }
  if (generating) {
    return (
      <div>
        <PageHeader back={back} title={draft.title} />
        <Notice tone="info">
          Writing the draft from the gap brief. This takes about a minute.
        </Notice>
      </div>
    );
  }
  if (draft.status === 'failed') {
    return (
      <div>
        <PageHeader back={back} title={draft.title} />
        <Notice tone="error">The draft could not be written: {draft.error}</Notice>
      </div>
    );
  }

  const placeholders = countPlaceholders(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded.data.post);
  const wordpress = workspace.wordpress;
  const update = (change: Partial<Post>) => setDraft({ ...draft, ...change });
  const updateFaq = (index: number, change: Partial<FaqPair>) =>
    update({
      faq: draft.faq.map((pair, position) => (position === index ? { ...pair, ...change } : pair)),
    });

  function saveDraft() {
    void save.run(async () => {
      const result = await api.savePost(workspaceId, draft!);
      setDraft(result.post);
      loaded.reload();
    });
  }

  function publishNow() {
    void publish.run(async () => {
      if (dirty) {
        await api.savePost(workspaceId, draft!);
      }
      await api.publishPost(workspaceId, postId, target);
      loaded.reload();
    });
  }

  return (
    <div className="editor-page">
      <PageHeader
        back={back}
        title={draft.title || 'Untitled page'}
        description={
          draft.status === 'published' && draft.publishedUrl ? (
            <>
              Published {draft.publishedAt ? dateTime(draft.publishedAt) : ''} at{' '}
              <a href={draft.publishedUrl} target="_blank" rel="noopener noreferrer">
                {draft.publishedUrl}
              </a>
            </>
          ) : (
            <>
              Draft
              {draft.gapId && (
                <>
                  {' '}
                  from <a href={href.gap(workspaceId, draft.gapId)}>this gap</a>
                </>
              )}
            </>
          )
        }
        actions={
          <button className="button" disabled={save.busy || !dirty} onClick={saveDraft}>
            {dirty ? 'Save draft' : 'Saved'}
          </button>
        }
      />
      <ErrorText message={save.error} />

      <div className="editor">
        <div className="editor-fields">
          <label className="field">
            <span>Title</span>
            <input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Address</span>
            <span className="input-prefix">
              <span>/guides/</span>
              <input
                value={draft.slug}
                onChange={(event) => update({ slug: event.target.value })}
              />
            </span>
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Page body, in Markdown</span>
            <textarea
              className="markdown-input"
              rows={24}
              value={draft.markdown}
              onChange={(event) => update({ markdown: event.target.value })}
            />
          </label>
          <fieldset className="faq-editor">
            <legend>Questions and answers</legend>
            {draft.faq.map((pair, index) => (
              <div key={index} className="faq-pair">
                <input
                  aria-label={`Question ${index + 1}`}
                  value={pair.question}
                  onChange={(event) => updateFaq(index, { question: event.target.value })}
                />
                <textarea
                  aria-label={`Answer ${index + 1}`}
                  rows={2}
                  value={pair.answer}
                  onChange={(event) => updateFaq(index, { answer: event.target.value })}
                />
                <button
                  className="link-button link-danger"
                  onClick={() =>
                    update({ faq: draft.faq.filter((_, position) => position !== index) })
                  }
                >
                  Remove question
                </button>
              </div>
            ))}
            <button
              className="button"
              disabled={draft.faq.length >= 10}
              onClick={() => update({ faq: [...draft.faq, { question: '', answer: '' }] })}
            >
              Add question
            </button>
          </fieldset>
        </div>

        <aside className="editor-rail">
          <Panel title="Publish" className="publish-panel">
            {placeholders > 0 ? (
              <p className="placeholder-count">
                <strong>{placeholders}</strong> [fill in]{' '}
                {placeholders === 1 ? 'placeholder' : 'placeholders'} left. Replace each with a fact
                you can stand behind.
              </p>
            ) : (
              <p className="crawler-ok">Every fact is filled in.</p>
            )}
            <label className="field">
              <span>Where</span>
              <select value={target} onChange={(event) => setTarget(event.target.value as Target)}>
                <option value="hosted">Hosted page under /guides</option>
                <option value="wordpress" disabled={!wordpress}>
                  WordPress{wordpress ? ` (${wordpress.postStatus})` : ', set it up in settings'}
                </option>
              </select>
            </label>
            <CrawlerStatus check={crawler} />
            <ErrorText message={publish.error} />
            <button
              className="button button-primary"
              disabled={publish.busy || placeholders > 0}
              onClick={publishNow}
            >
              {draft.status === 'published' ? 'Publish changes' : 'Publish'}
            </button>
            {draft.status === 'published' && draft.target === 'hosted' && (
              <button
                className="link-button link-danger"
                disabled={publish.busy}
                onClick={() =>
                  publish.run(async () => {
                    await api.unpublishPost(workspaceId, postId);
                    loaded.reload();
                  })
                }
              >
                Unpublish
              </button>
            )}
          </Panel>
          <Panel title="Preview" className="preview-panel">
            <article className="preview">
              <h1>{draft.title}</h1>
              <p className="preview-lede">
                <WithPlaceholders text={draft.description} />
              </p>
              <div dangerouslySetInnerHTML={{ __html: preview }} />
            </article>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
