const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export { escapeHtml };

const MARK = String.fromCharCode(0);
const CODE_SLOT = new RegExp(`${MARK}(\\d+)${MARK}`, 'g');

function safeHref(raw: string): string | undefined {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href) || href.startsWith('#')) {
    return href;
  }
  return undefined;
}

export function renderInline(text: string): string {
  const codes: string[] = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `${MARK}${codes.length - 1}${MARK}`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, rawHref: string) => {
    const href = safeHref(rawHref.replace(/&amp;/g, '&'));
    return href ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return html.replace(CODE_SLOT, (_, index: string) => codes[Number(index)]);
}

export interface Heading {
  level: number;
  text: string;
}

export function markdownToHtml(markdown: string): { html: string; headings: Heading[] } {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let code: string[] | undefined;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`,
      );
      list = undefined;
    }
  };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = undefined;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      headings.push({ level, text: heading[2] });
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) {
        flushList();
      }
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      out.push(`<blockquote><p>${renderInline(line.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) {
    out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return { html: out.join('\n'), headings };
}
