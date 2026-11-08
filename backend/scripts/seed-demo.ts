import { parseArgs } from 'node:util';
import { loadOutputs } from './outputs.js';
import { DEMO_COMPETITORS, DEMO_PROMPTS, DEMO_SETTINGS } from './demo-data.js';

loadOutputs();
const { newId, slugify } = await import('../src/core/ids.js');
const { findBrandTerms } = await import('../src/core/prompts.js');
const { WorkspaceSettings } = await import('../src/core/schemas.js');
const { upsertWeeklySchedule } = await import('../src/core/schedules.js');
const { putPrompt, putWorkspace, replaceCompetitors } = await import('../src/data/workspaces.js');

const { values } = parseArgs({
  options: {
    owner: { type: 'string', default: 'demo' },
    engines: { type: 'string', default: 'fake' },
    samples: { type: 'string', default: '3' },
    prompts: { type: 'string', default: String(DEMO_PROMPTS.length) },
    schedule: { type: 'boolean', default: false },
  },
});

const settings = WorkspaceSettings.parse({
  ...DEMO_SETTINGS,
  engines: values.engines.split(',').map((engine) => engine.trim()),
  samples: Number(values.samples),
  schedule: values.schedule ? 'weekly' : 'off',
});
const workspaceId = newId();
const createdAt = new Date().toISOString();
await putWorkspace({ ...settings, workspaceId, ownerId: values.owner, createdAt });
await replaceCompetitors(
  workspaceId,
  DEMO_COMPETITORS.map((competitor) => ({ ...competitor, slug: slugify(competitor.name) })),
);
for (const prompt of DEMO_PROMPTS.slice(0, Number(values.prompts))) {
  const named = findBrandTerms(prompt.text, settings.brand);
  if (named.length) {
    throw new Error(`demo prompt names the brand: ${prompt.text}`);
  }
  await putPrompt(workspaceId, { ...prompt, promptId: newId(), createdAt });
}
if (settings.schedule === 'weekly') {
  await upsertWeeklySchedule(workspaceId);
}
console.log(workspaceId);
