import { Hono } from 'hono';
import { HttpError } from '../../core/http-error.js';
import { newId } from '../../core/ids.js';
import { findBrandTerms } from '../../core/prompts.js';
import { MAX_PROMPTS, PromptInput, type PromptRecord, type Workspace } from '../../core/schemas.js';
import { listPromptAnswers } from '../../data/answers.js';
import {
  deletePrompt,
  getPrompt,
  listCompetitors,
  listPrompts,
  putPrompt,
} from '../../data/workspaces.js';
import { suggestPrompts } from '../../suggest/prompts.js';
import type { AppEnv } from '../auth.js';
import { ownedWorkspace } from '../ownership.js';

function assertBrandFree(text: string, workspace: Workspace): void {
  const named = findBrandTerms(text, workspace.brand);
  if (named.length) {
    throw new HttpError(
      400,
      'brand_in_prompt',
      `Buyers would not name you; remove ${named.map((term) => `"${term}"`).join(', ')}`,
    );
  }
}

async function ownedPrompt(workspace: Workspace, promptId: string): Promise<PromptRecord> {
  const prompt = /^[A-Za-z0-9-]{1,64}$/.test(promptId)
    ? await getPrompt(workspace.workspaceId, promptId)
    : undefined;
  if (!prompt) {
    throw new HttpError(404, 'not_found', 'Prompt not found');
  }
  return prompt;
}

export const promptRoutes = new Hono<AppEnv>();

promptRoutes.post('/:ws/prompts', async (context) => {
  const workspace = await ownedWorkspace(context);
  const input = PromptInput.parse(await context.req.json());
  assertBrandFree(input.text, workspace);
  const prompts = await listPrompts(workspace.workspaceId);
  if (prompts.length >= MAX_PROMPTS) {
    throw new HttpError(409, 'limit', `At most ${MAX_PROMPTS} prompts per workspace`);
  }
  if (prompts.some((prompt) => prompt.text.toLowerCase() === input.text.toLowerCase())) {
    throw new HttpError(409, 'duplicate', 'That prompt is already tracked');
  }
  const prompt: PromptRecord = { ...input, promptId: newId(), createdAt: new Date().toISOString() };
  await putPrompt(workspace.workspaceId, prompt);
  return context.json({ prompt }, 201);
});

promptRoutes.put('/:ws/prompts/:id', async (context) => {
  const workspace = await ownedWorkspace(context);
  const existing = await ownedPrompt(workspace, context.req.param('id'));
  const input = PromptInput.parse(await context.req.json());
  assertBrandFree(input.text, workspace);
  const prompt: PromptRecord = { ...existing, ...input };
  await putPrompt(workspace.workspaceId, prompt);
  return context.json({ prompt });
});

promptRoutes.delete('/:ws/prompts/:id', async (context) => {
  const workspace = await ownedWorkspace(context);
  const prompt = await ownedPrompt(workspace, context.req.param('id'));
  await deletePrompt(workspace.workspaceId, prompt.promptId);
  return context.json({ deleted: true });
});

promptRoutes.post('/:ws/prompts/suggest', async (context) => {
  const workspace = await ownedWorkspace(context);
  const [competitors, prompts] = await Promise.all([
    listCompetitors(workspace.workspaceId),
    listPrompts(workspace.workspaceId),
  ]);
  try {
    const suggestions = await suggestPrompts(
      workspace,
      competitors,
      prompts.map((prompt) => prompt.text),
    );
    return context.json({ suggestions });
  } catch (error) {
    if ((error as Error).name === 'FetchRefused') {
      throw new HttpError(
        422,
        'site_unreadable',
        `Could not read your site: ${(error as Error).message}`,
      );
    }
    throw error;
  }
});

promptRoutes.get('/:ws/prompts/:id/answers', async (context) => {
  const workspace = await ownedWorkspace(context);
  const prompt = await ownedPrompt(workspace, context.req.param('id'));
  const runId = context.req.query('runId');
  if (runId !== undefined && !/^[A-Za-z0-9-]{1,64}$/.test(runId)) {
    throw new HttpError(400, 'bad_request', 'runId is not valid');
  }
  const answers = await listPromptAnswers(workspace.workspaceId, prompt.promptId, runId);
  return context.json({ prompt, runId: answers[0]?.runId ?? runId ?? null, answers });
});
