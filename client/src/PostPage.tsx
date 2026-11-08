import { useEffect, useMemo, useState } from 'react';
import { api, type CrawlerCheck, type FaqPair, type Post } from './api';
import { dateTime } from './format';
import { markdownToHtml } from './markdown';
import { href } from './route';
import { useAction } from './useAction';
import { useLoad } from './useLoad';

const PLACEHOLDER = /\[fill in[^\]]*\]/gi;
const POLL_MS = 4000;

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

function CrawlerWarning({ check }: { check: CrawlerCheck | null }) {
  if (!check) {
    return null;
  }
  const blocked = check.crawlers.filter((crawler) => !crawler.allowed);
  if (!blocked.length) {
    return (
      <p className="ok small">
        {check.domain} lets {check.crawlers.map((crawler) => crawler.agent).join(', ')} read{' '}
        {check.path}.
      </p>
    );
  }
  return (
    <p className="banner warn">
      robots.txt on {check.domain} blocks {blocked.map((crawler) => crawler.agent).join(' and ')}.
      AI search cannot cite this page until that changes.
    </p>
  );
}

export function PostPage({ workspaceId, postId }: { workspaceId: string; postId: string }) {
  const loaded = useLoad(() => api.post(workspaceId, postId), [workspaceId, postId]);
  const view = useLoad(() => api.workspace(workspaceId), [workspaceId]);
  const [draft, setDraft] = useState<Post | null>(null);
  const [target, setTarget] = useState<'hosted' | 'wordpress'>('hosted');
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

  const preview = useMemo(() => (draft ? markdownToHtml(draft.markdown).html : ''), [draft]);

  if (loaded.error) {
    return <p className="error">{loaded.error}</p>;
  }
  if (!loaded.data || !draft) {
    return <p className="muted">Loading</p>;
  }
  if (generating) {
    return (
      <div>
        <a className="back" href={href.posts(workspaceId)}>
          All pages
        </a>
        <h1>{draft.title}</h1>
        <p className="banner running" role="status">
          Writing the draft from the gap brief. This takes about a minute.
        </p>
      </div>
    );
  }
  if (draft.status === 'failed') {
    return (
      <div>
        <a className="back" href={href.posts(workspaceId)}>
          All pages
        </a>
        <h1>{draft.title}</h1>
        <p className="banner warn">The draft could not be written: {draft.error}</p>
      </div>
    );
  }

  const placeholders = countPlaceholders(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded.data.post);
  const wordpress = view.data?.workspace.wordpress;
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
    <div className="post-page">
      <a className="back" href={href.posts(workspaceId)}>
        All pages
      </a>
      <div className="page-head">
        <div>
          <h1>{draft.title}</h1>
          <p className="muted">
            {draft.status === 'published' && draft.publishedUrl ? (
              <>
                Published {draft.publishedAt ? dateTime(draft.publishedAt) : ''} at{' '}
                <a href={draft.publishedUrl} target="_blank" rel="noopener noreferrer">
                  {draft.publishedUrl}
                </a>
              </>
            ) : (
              'Draft'
            )}
            {draft.gapId && (
              <>
                {' '}
                from <a href={href.gap(workspaceId, draft.gapId)}>this gap</a>
              </>
            )}
          </p>
        </div>
        <div className="actions">
          <button disabled={save.busy || !dirty} onClick={saveDraft}>
            {dirty ? 'Save draft' : 'Saved'}
          </button>
        </div>
      </div>
      {save.error && <p className="error">{save.error}</p>}

      <div className="editor">
        <div className="editor-fields stack">
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <div className="row">
            <label>
              Address
              <span className="slug-field">
                <span className="muted">/guides/</span>
                <input
                  value={draft.slug}
                  onChange={(event) => update({ slug: event.target.value })}
                />
              </span>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </label>
          <label>
            Page body (Markdown)
            <textarea
              className="markdown-input"
              rows={22}
              value={draft.markdown}
              onChange={(event) => update({ markdown: event.target.value })}
            />
          </label>
          <fieldset className="faq-editor">
            <legend>Questions and answers</legend>
            {draft.faq.map((pair, index) => (
              <div key={index} className="faq-pair">
                <input
                  aria-label="Question"
                  value={pair.question}
                  onChange={(event) => updateFaq(index, { question: event.target.value })}
                />
                <textarea
                  aria-label="Answer"
                  rows={2}
                  value={pair.answer}
                  onChange={(event) => updateFaq(index, { answer: event.target.value })}
                />
                <button
                  className="link-button danger"
                  onClick={() =>
                    update({ faq: draft.faq.filter((_, position) => position !== index) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              disabled={draft.faq.length >= 10}
              onClick={() => update({ faq: [...draft.faq, { question: '', answer: '' }] })}
            >
              Add question
            </button>
          </fieldset>
        </div>
        <aside className="editor-side">
          <section className="section publish-box">
            <h2>Publish</h2>
            {placeholders > 0 ? (
              <p className="banner warn">
                {placeholders} [fill in] placeholder{placeholders === 1 ? '' : 's'} left. Replace
                each with a fact you can stand behind before publishing.
              </p>
            ) : (
              <p className="ok small">No placeholders left.</p>
            )}
            <label>
              Where
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value as 'hosted' | 'wordpress')}
              >
                <option value="hosted">Hosted /guides page</option>
                <option value="wordpress" disabled={!wordpress}>
                  WordPress{wordpress ? ` (${wordpress.postStatus})` : ' (add it in settings)'}
                </option>
              </select>
            </label>
            <CrawlerWarning check={crawler} />
            {publish.error && <p className="error">{publish.error}</p>}
            <button
              className="primary"
              disabled={publish.busy || placeholders > 0}
              onClick={publishNow}
            >
              {draft.status === 'published' ? 'Publish changes' : 'Publish'}
            </button>
            {draft.status === 'published' && draft.target === 'hosted' && (
              <button
                className="link-button danger"
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
          </section>
          <section className="section preview">
            <h2>Preview</h2>
            <article className="preview-body">
              <h1>{draft.title}</h1>
              <p className="muted">{draft.description}</p>
              <div dangerouslySetInnerHTML={{ __html: preview }} />
            </article>
          </section>
        </aside>
      </div>
    </div>
  );
}
