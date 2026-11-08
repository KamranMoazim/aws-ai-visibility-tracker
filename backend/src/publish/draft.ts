import { z } from 'zod';
import { callTool } from '../core/bedrock.js';
import { slugify } from '../core/ids.js';
import type { Brief } from '../gaps/brief.js';
import { FILL_IN } from '../gaps/brief.js';

export const DRAFT_TOOL = 'record_draft';

const SYSTEM_PROMPT = [
  'You write a helpful, plain-spoken web page for a company, from an editorial brief.',
  'Write for a buyer comparing options: answer the question directly first, then give detail.',
  `Never state a fact about the company or its product that the brief does not give; write "${FILL_IN}"`,
  'in its place, for example "Fees start at [fill in]". Do not invent reviews, testimonials, awards,',
  'customer counts or rankings, and do not claim to be the best. Mention competitors fairly or not at all.',
  'Use Markdown with ## and ### headings, short paragraphs and lists. Do not include an H1 or HTML.',
  'Answer each of the brief questions somewhere in the page, using the question wording as a heading',
  'or in the FAQ.',
].join(' ');

export const Draft = z.object({
  title: z.string().trim().min(5).max(120),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().min(10).max(300),
  markdown: z.string().trim().min(100).max(40_000),
  faq: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(300),
        answer: z.string().trim().min(3).max(2000),
      }),
    )
    .max(10)
    .default([]),
});
export type Draft = z.infer<typeof Draft>;

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string', description: 'lowercase-words-with-hyphens' },
    description: { type: 'string', description: 'Meta description, one or two sentences' },
    markdown: { type: 'string', description: 'The page body in Markdown, without an H1' },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['title', 'slug', 'description', 'markdown', 'faq'],
};

export function normalizeDraft(draft: Draft): Required<Draft> {
  return {
    ...draft,
    slug: slugify(draft.slug || draft.title) || 'guide',
    markdown: draft.markdown.replace(/^#\s+.+\n+/, ''),
  };
}

export function buildDraftInput(brandName: string, promptText: string, brief: Brief): string {
  return [
    `Company: ${brandName}`,
    `Buyer question the page must answer: ${promptText}`,
    `Page type: ${brief.pageType}. Working title: ${brief.title}`,
    `Outline:\n${brief.outline.map((section) => `## ${section.heading}\n${section.points.map((point) => `- ${point}`).join('\n')}`).join('\n')}`,
    `Points to cover that competing pages already cover:\n${brief.missingPoints.map((point) => `- ${point}`).join('\n')}`,
    `Questions to answer word for word:\n${brief.questions.map((question) => `- ${question}`).join('\n')}`,
    `Product facts the company must supply (leave as ${FILL_IN}):\n${brief.facts.map((fact) => `- ${fact}`).join('\n')}`,
    `Phrases buyers and answers use: ${brief.phrases.join(', ')}`,
  ].join('\n\n');
}

export async function writeDraft(brandName: string, promptText: string, brief: Brief) {
  const result = await callTool({
    system: SYSTEM_PROMPT,
    user: buildDraftInput(brandName, promptText, brief),
    toolName: DRAFT_TOOL,
    description: 'Record the page draft',
    schema: INPUT_SCHEMA,
    modelId: process.env.DRAFT_MODEL_ID || undefined,
    maxTokens: 6000,
  });
  return { draft: normalizeDraft(Draft.parse(result.input)), model: result.model };
}
