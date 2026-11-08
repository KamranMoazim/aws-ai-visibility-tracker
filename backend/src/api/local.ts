import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadOutputs } from '../../scripts/outputs.js';

const outputs = loadOutputs();
process.env.USER_POOL_ID ??= outputs.UserPoolId;
process.env.USER_POOL_CLIENT_ID ??= outputs.UserPoolClientId;
const { app } = await import('./app.js');
const PORT = Number(process.env.PORT ?? 4000);

const local = new Hono().use('*', cors({ origin: 'http://localhost:5173' })).route('/', app);
serve({ fetch: local.fetch, port: PORT }, () => console.log(`api on http://localhost:${PORT}`));
