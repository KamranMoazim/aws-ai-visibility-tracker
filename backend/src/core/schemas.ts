import { z } from 'zod';
import { ENGINE_IDS } from '../engines/types.js';

export const MAX_COMPETITORS = 10;
export const MAX_PROMPTS = 50;
export const PROMPT_STAGES = ['problem', 'solution', 'comparison'] as const;

const Name = z.string().trim().min(2).max(80);
const Domain = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/, 'must be a domain like example.com');
const Aliases = z.array(Name).max(10).default([]);

export const Brand = z.object({ name: Name, domain: Domain, aliases: Aliases });
export type Brand = z.infer<typeof Brand>;

export const Competitor = z.object({ name: Name, domain: Domain.optional(), aliases: Aliases });
export type Competitor = z.infer<typeof Competitor>;

export const WordPressSettings = z.object({
  siteUrl: z
    .string()
    .trim()
    .url()
    .regex(/^https:\/\//, 'must start with https://'),
  username: z.string().trim().min(1).max(60),
  postStatus: z.enum(['draft', 'publish']).default('draft'),
});

export const WorkspaceSettings = z.object({
  name: z.string().trim().min(1).max(80),
  brand: Brand,
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  engines: z.array(z.enum(ENGINE_IDS)).min(1).default(['openai', 'nova', 'sonar']),
  samples: z.number().int().min(1).max(5).default(3),
  schedule: z.enum(['weekly', 'off']).default('weekly'),
  wordpress: WordPressSettings.optional(),
  digest: z.boolean().default(true),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

export const PromptInput = z.object({
  text: z.string().trim().min(8).max(400),
  stage: z.enum(PROMPT_STAGES),
  active: z.boolean().default(true),
});
export type PromptInput = z.infer<typeof PromptInput>;

export interface Workspace extends WorkspaceSettings {
  workspaceId: string;
  ownerId: string;
  createdAt: string;
  lastManualRunAt?: string;
  sitemapImport?: { status: string; pages?: number; at: string; error?: string };
}

export interface CompetitorRecord extends Competitor {
  slug: string;
}

export interface PromptRecord extends PromptInput {
  promptId: string;
  createdAt: string;
}
