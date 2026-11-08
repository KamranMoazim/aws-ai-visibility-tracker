import { createHash } from 'node:crypto';
import { EngineError, type AnswerEngine, type EngineAnswer } from './types.js';

export const FAKE_FAIL_MARKER = '[[fail]]';

export interface FakeAnswer {
  text: string;
  citations: string[];
}

export const FAKE_ANSWERS: FakeAnswer[] = [
  {
    text: 'For invoicing international clients, Wise Business and Payoneer are the usual picks. Wise is recommended for low FX fees and multi-currency accounts; Payoneer suits marketplaces. PayPal works but its conversion fees are higher.',
    citations: [
      'https://www.nerdwallet.com/article/small-business/international-invoicing',
      'https://wise.com/us/business/invoicing',
    ],
  },
  {
    text: 'Most freelancers use PayPal or Wise Business. Unlike PayPal, Wise shows the mid-market rate up front. Payoneer is another option if your clients pay through marketplaces.',
    citations: ['https://www.forbes.com/advisor/business/best-international-payment-services/'],
  },
  {
    text: 'Payoneer is often the easiest for agencies billing in several currencies, followed by Wise. Stripe Invoicing is a good fit if you already take cards.',
    citations: ['https://www.payoneer.com/resources/invoicing/', 'https://stripe.com/invoicing'],
  },
];

export function fakeEngine(answers: FakeAnswer[] = FAKE_ANSWERS): AnswerEngine {
  return {
    id: 'fake',
    async ask(prompt, options) {
      if (prompt.includes(FAKE_FAIL_MARKER)) {
        throw new EngineError('fake', 400, false, 'forced failure');
      }
      const seed = createHash('sha256').update(prompt).digest().readUInt32BE(0);
      const answer = answers[(seed + (options.sample ?? 0)) % answers.length];
      const result: EngineAnswer = {
        text: answer.text,
        citations: answer.citations.map((url) => ({ url })),
        model: 'fake',
        searchCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        raw: { fake: true, prompt, sample: options.sample ?? 0 },
      };
      return result;
    },
  };
}
