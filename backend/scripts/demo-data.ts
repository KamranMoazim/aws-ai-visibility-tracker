import type { Competitor, PromptInput, WorkspaceSettings } from '../src/core/schemas.js';

export const DEMO_SETTINGS: Omit<WorkspaceSettings, 'engines' | 'samples' | 'schedule'> = {
  name: 'Acme Pay demo',
  brand: { name: 'Acme Pay', domain: 'acmepay.io', aliases: ['AcmePay'] },
  country: 'US',
};

export const DEMO_COMPETITORS: Competitor[] = [
  { name: 'Wise', domain: 'wise.com', aliases: ['Wise Business', 'TransferWise'] },
  { name: 'Payoneer', domain: 'payoneer.com', aliases: [] },
  { name: 'PayPal', domain: 'paypal.com', aliases: [] },
  { name: 'Stripe', domain: 'stripe.com', aliases: ['Stripe Invoicing'] },
  { name: 'Revolut', domain: 'revolut.com', aliases: ['Revolut Business'] },
];

export const DEMO_PROMPTS: PromptInput[] = [
  {
    text: "What's the easiest way to invoice international clients?",
    stage: 'problem',
    active: true,
  },
  {
    text: 'How do freelancers get paid by clients in other countries?',
    stage: 'problem',
    active: true,
  },
  {
    text: 'How can a small agency avoid high currency conversion fees on invoices?',
    stage: 'problem',
    active: true,
  },
  {
    text: 'Best invoicing tool for a consultant billing in USD, EUR and GBP',
    stage: 'solution',
    active: true,
  },
  {
    text: 'Which payment platform has the lowest fees for receiving international payments?',
    stage: 'solution',
    active: true,
  },
  {
    text: 'What software lets me send invoices in multiple currencies?',
    stage: 'solution',
    active: true,
  },
  {
    text: 'Is a multi-currency account better than PayPal for client payments?',
    stage: 'comparison',
    active: true,
  },
  { text: 'Wise vs Payoneer for agencies: which is cheaper?', stage: 'comparison', active: true },
  {
    text: 'Top alternatives to PayPal for international invoicing',
    stage: 'comparison',
    active: true,
  },
  {
    text: 'Compare tools for getting paid by overseas clients with low FX fees',
    stage: 'comparison',
    active: true,
  },
];
