import { Hono } from 'hono';
import { ZodError } from 'zod';
import { HttpError } from '../core/http-error.js';
import { requireUser, type AppEnv } from './auth.js';
import { gapRoutes } from './routes/gaps.js';
import { postRoutes } from './routes/posts.js';
import { promptRoutes } from './routes/prompts.js';
import { runRoutes } from './routes/runs.js';
import { visibilityRoutes } from './routes/visibility.js';
import { workspaceRoutes } from './routes/workspaces.js';

export const app = new Hono<AppEnv>();

app.get('/health', (context) => context.json({ ok: true }));
app.use('/workspaces', requireUser);
app.use('/workspaces/*', requireUser);
app.route('/workspaces', workspaceRoutes);
app.route('/workspaces', promptRoutes);
app.route('/workspaces', runRoutes);
app.route('/workspaces', visibilityRoutes);
app.route('/workspaces', gapRoutes);
app.route('/workspaces', postRoutes);

app.notFound((context) => context.json({ error: 'not_found', message: 'Not found' }, 404));
app.onError((error, context) => {
  if (error instanceof HttpError) {
    return context.json({ error: error.code, message: error.message }, error.status as 400);
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return context.json(
      { error: 'bad_request', message: `${issue.path.join('.') || 'body'}: ${issue.message}` },
      400,
    );
  }
  if (error instanceof SyntaxError) {
    return context.json({ error: 'bad_request', message: 'Body must be JSON' }, 400);
  }
  console.error(`${context.req.method} ${context.req.path} failed: ${error.name} ${error.message}`);
  return context.json({ error: 'internal', message: 'internal error' }, 500);
});
