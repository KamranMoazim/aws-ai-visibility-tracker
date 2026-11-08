import type { Run } from '../data/runs.js';
import { escapeHtml } from '../publish/markdown.js';

export interface DigestInput {
  workspaceName: string;
  brandName: string;
  dashboardUrl: string;
  run: Run;
  previous?: Pick<Run, 'rates' | 'startedAt'> & { mentioned?: number; answers?: number };
  totals?: { mentioned: number; answers: number };
  promptText: (promptId: string) => string;
  engineLabel: (engine: string) => string;
}

export interface Digest {
  subject: string;
  text: string;
  html: string;
}

const TOP_GAPS = 5;
const pct = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? 'n/a' : `${Math.round(rate * 100)}%`;

function change(now: number | null | undefined, before: number | null | undefined): string {
  if (now === null || now === undefined || before === null || before === undefined) {
    return '';
  }
  const points = Math.round((now - before) * 100);
  if (points === 0) {
    return ' (no change)';
  }
  return ` (${points > 0 ? 'up' : 'down'} ${Math.abs(points)} points)`;
}

export function buildDigest(input: DigestInput): Digest {
  const { run, previous, totals } = input;
  if (run.status === 'refused' || run.status === 'failed') {
    const reason = run.refusedReason ?? 'no answers could be read';
    const text = `The ${run.trigger} run for ${input.workspaceName} did not complete: ${reason}.\n\n${input.dashboardUrl}\n`;
    return {
      subject: `${input.workspaceName}: run did not complete`,
      text,
      html: `<p>${escapeHtml(text.trim()).replace(/\n\n/g, '</p><p>')}</p>`,
    };
  }

  const mentionRate = run.rates?.mentionRate;
  const lines: string[] = [];
  const headline = totals
    ? `AI answers named ${input.brandName} in ${totals.mentioned} of ${totals.answers} answers (${pct(mentionRate)})${change(mentionRate, previous?.rates?.mentionRate)}.`
    : `Mention rate ${pct(mentionRate)}${change(mentionRate, previous?.rates?.mentionRate)}.`;
  lines.push(headline);
  lines.push(
    `Share of voice ${pct(run.rates?.shareOfVoice)}, cited ${pct(run.rates?.citationRate)} of the time.`,
  );

  const sections: { title: string; items: string[] }[] = [];
  const describe = (change: { promptId: string; engine: string }) =>
    `${input.promptText(change.promptId)} (${input.engineLabel(change.engine)})`;
  if (run.diff?.gained.length) {
    sections.push({ title: 'Now named', items: run.diff.gained.map(describe) });
  }
  if (run.diff?.lost.length) {
    sections.push({ title: 'No longer named', items: run.diff.lost.map(describe) });
  }
  if (run.newBrands?.length) {
    sections.push({ title: 'New brands in the answers', items: run.newBrands });
  }
  const gaps = (run.gapCandidates ?? [])
    .slice()
    .sort((left, right) => right.missingRate - left.missingRate)
    .slice(0, TOP_GAPS);
  if (gaps.length) {
    sections.push({
      title: `Gaps (${run.gapCandidates!.length})`,
      items: gaps.map((gap) =>
        gap.missingEngines.length
          ? `${input.promptText(gap.promptId)}: missing on ${gap.missingEngines.map(input.engineLabel).join(', ')}`
          : `${input.promptText(gap.promptId)}: your site is never cited`,
      ),
    });
  }
  const footer = [
    `${run.extracted} answers read${run.failed ? `, ${run.failed} failed` : ''}. Measured cost $${(run.cost?.total ?? 0).toFixed(2)}.`,
    input.dashboardUrl,
  ];

  const text = [
    lines.join(' '),
    ...sections.map(
      (section) => `${section.title}:\n${section.items.map((item) => `- ${item}`).join('\n')}`,
    ),
    footer.join('\n'),
  ].join('\n\n');
  const html = [
    `<p>${escapeHtml(lines.join(' '))}</p>`,
    ...sections.map(
      (section) =>
        `<h3>${escapeHtml(section.title)}</h3><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
    ),
    `<p>${escapeHtml(footer[0])}<br><a href="${escapeHtml(input.dashboardUrl)}">Open the dashboard</a></p>`,
  ].join('\n');
  const direction = change(mentionRate, previous?.rates?.mentionRate);
  return {
    subject: `${input.workspaceName}: named in ${pct(mentionRate)} of answers${direction}`,
    text: `${text}\n`,
    html,
  };
}
