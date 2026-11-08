# AnswerShare user guide

How to use AnswerShare day to day: get an account, set up a brand, run it, read the results, act on gaps, publish a page, and let an AI assistant query it. For how it is built, see the [README](README.md) and the [architecture diagram](docs/architecture.drawio).

Every deployment has its own addresses. After `npm run infra:deploy`, read them from `infra/cdk-outputs.json`; this guide refers to them by these names:

| Placeholder | Output | What |
| --- | --- | --- |
| `<SiteUrl>` | `SiteUrl` | The web app, and hosted guides under `/guides` |
| `<GatewayUrl>` | `GatewayUrl` | MCP endpoint for AI assistants |
| `<CognitoDomain>` | `CognitoDomain` | Sign-in page used when an assistant connects |

## Words used in the app

| Word | Means |
| --- | --- |
| Workspace | One brand you track, with its competitors, questions and history |
| Buyer question (prompt) | A question a buyer types into an AI assistant before they know your name |
| Engine | An AI answer service AnswerShare asks: OpenAI with web search, Nova on Bedrock, Perplexity Sonar, or Fake for free tests |
| Sample | One answer to one question from one engine. Each question is asked several times because answers vary |
| Run | One round of asking every active question of every engine, sample by sample |
| Mention | An answer naming a brand. The order brands are named in is the position |
| Gap | A question where answers leave you out, or never cite your site |
| Brief | The plan for the page that fills a gap |
| Page | A draft written from a brief, which you edit and publish |

## Getting an account

There is no self sign-up. The owner of the deployment creates each account from their own terminal (not through an AI assistant's shell, which has no terminal to type the password into):

```bash
npm run add-user -- you@example.com
```

It asks for a password of at least 12 characters and prints `<SiteUrl>`. Running it again for the same email sets a new password. Open `<SiteUrl>` and sign in.

## Setting up a brand

1. **Track a new brand.** On the first page, enter the brand name, website, any other names buyers use for it (for example `AcmePay` for `Acme Pay`), and the buyers' country. Create the workspace; it opens Settings.
2. **Competitors.** Add up to 10, each with a website and other names. Answers that use any of these names count for that competitor. Your own brand cannot be a competitor.
3. **Buyer questions.** Add 10 to 50, each tagged with a stage:
   - *problem*: the buyer's pain or goal ("How do freelancers get paid by clients abroad?")
   - *solution*: what kind of tool solves it ("Best invoicing tool for USD, EUR and GBP")
   - *comparison*: choosing between options ("Wise vs Payoneer for agencies")

   A question that contains your brand name, another name or your domain is rejected, because buyers who already know you are not what you are measuring. **Suggest questions from my site** reads your homepage and sitemap and proposes questions you can add with one click. **Pause** keeps a question and its history but stops asking it.
4. **Engines.** Tick the engines to ask. Nova needs nothing extra. OpenAI and Sonar need API keys stored with `npm run keys:set`; without a key the engine is skipped and the run says so. **Fake** gives canned answers at no cost, for trying the app out.
5. **Samples and schedule.** 3 samples per question is the default and the minimum for a trustworthy rate. Choose **Every Monday** or **Only when I press Run now**.
6. **Email me a summary after each run** sends the digest described below.
7. **Your pages.** **Import sitemap.xml** reads up to 500 pages from your site (titles for the first 150). Gap briefs use them to find your closest existing page.

## Running

**Run now** on the Overview starts a run. It is greyed out while a run is in progress, for an hour after the previous manual run, and when no question is active. Scheduled runs start Monday morning (UTC).

While a run is going, the Overview shows how many answers are in and how many have been read. A run of 25 questions, 3 engines and 3 samples (225 answers) takes a few minutes.

A run is **refused**, before any engine is called, when it would exceed the per-run cap (300 calls by default), when no question is active, or when no engine is available. The banner gives the reason.

**What a run costs.** Each run records its measured cost, shown under Recent runs and in the digest. On Nova alone, one grounded answer including reading it costs about $0.04; a default 225-answer run on three engines is roughly $4 to $7. Fake runs cost nothing.

## Reading the Overview

**The headline** says how many answers named you in the latest run, for example *AI answers named Acme Pay in 14 of 54 answers*. Below it:

| Figure | Means |
| --- | --- |
| Named first | Answers where you were the first brand named |
| Average position | Your average place in the order, counting only answers that name you |
| Share of voice | Your mentions out of all mentions of tracked brands |
| Recommended | Answers that suggest choosing you, not only list you |
| Your site cited | Answers that link to a page on your domain |

Every figure shows its sample size (`5/54`), so a jump from 1 of 3 to 2 of 3 is not mistaken for a trend.

**Mention rate over time** has one line per engine. Hover for the numbers, or press **Show table**. Dashed vertical lines mark the dates you published a page.

**Who comes up, by prompt** has one row per question and one column per engine. Each dot is one answer from the latest run; a filled dot named you. A red rule and a **Gap** tag mark questions that became gaps. Click a question to read its answers.

**Since the previous run** lists questions where an engine started or stopped naming you.

**Share of voice** compares tracked brands. **Most cited sites** shows the domains answers link to most, with your own domain marked. **Brands you are not tracking** lists names that keep appearing; **Track** adds one as a competitor.

## Reading the answers

Open a question from the Overview to see its answers side by side, one column per engine and one card per sample. Choose another run from the **Run** menu.

- Your brand is highlighted in yellow, tracked competitors are shaded with an underline, and other brands have a dotted underline.
- The chips above each answer list the brands in the order named, with **recommended** where the answer suggests choosing that brand.
- A yellow note means the name matcher and the model disagreed about a brand. Read the text and judge for yourself.
- Links under each answer are the pages it cited; your own pages are highlighted.
- **Sources these answers cite** totals the domains across all answers, and **This prompt over time** shows the trend for this question alone.

These are API answers with web search. The ChatGPT and Perplexity apps add memory, location and their own routing, so read them as a strong signal, not a copy of what one person sees.

## Gaps

A question becomes a gap when you are missing from at least 2 of 3 answers on any engine, or when no answer cites your site. After each run, AnswerShare writes a brief for each gap. **Find the gap** on a question page refreshes it by hand (at most once every 10 minutes).

The **Gaps** list is ordered by score: how often you are missing, times how many engines miss you, times the stage weight (comparison questions count double). Each gap's brief has:

- **The suggested page:** improve an existing page of yours, or write a new comparison guide, FAQ, pricing explainer or how-to, with a working title and an outline.
- **What the cited sources cover that you do not**, summarized from the pages the answers trust (never copied).
- **Questions to answer word for word**, and **phrases the answers use**.
- **Facts only you can supply**, such as prices, fees and supported currencies. AnswerShare never guesses these; each is a `[fill in]` placeholder.
- **Named instead of you**, **Sources compared** and **Your closest pages** (empty until you import your sitemap).

**Dismiss** moves a gap out of the open list; **Reopen** brings it back. A later run updates a dismissed gap's evidence without reopening it.

## Writing and publishing a page

1. On a gap, press **Draft a page**. The draft is written in about a minute.
2. Edit it under **Pages**: title, address (`/guides/<address>`), description, the body in Markdown, and questions and answers. The preview updates as you type.
3. Replace every `[fill in]` with a fact you can stand behind. **Publish** stays disabled until none remain. Do not add reviews, awards or claims you cannot back up.
4. Choose where:
   - **Hosted page under /guides**: published at `<SiteUrl>/guides/<address>/` with Article and FAQ structured data, listed in `sitemap.xml` and `llms.txt`.
   - **WordPress**: set it up under Settings, Publishing, with your site address and user, and store an application password with `npm run keys:set`. Posts go in as drafts or published, depending on that setting.
5. The panel checks `robots.txt` on the target site and warns if it blocks OpenAI's or Perplexity's search crawlers. Fix that first, or the page cannot be cited.
6. Press **Publish**. Edit and press **Publish changes** at any time; **Unpublish** takes a hosted page down.

Publishing is always a click by a person. Nothing is published automatically, and AI assistants connected through MCP cannot publish.

**Before and after.** A published page is linked to its question. The question's trend chart and the Overview chart mark the publish date. Engines have to crawl and index the page first, so expect weeks, not the next run.

## Emails

- **Run digest** (per workspace, if switched on): sent from the deployment's sender address to the workspace owner when a run finishes. It covers the mention rate and its change, questions gained and lost, new brands, the top gaps and the run's cost. A run that did not complete gets a short note with the reason.
- **Alerts** to the deployment's alert address: a gap job failed three times, a run failed or timed out, the API or publisher keeps erroring. After the first deploy, AWS emails a subscription confirmation; alerts only arrive once you click it.
- **Budget**: an email at 80% of the $30 monthly budget, and when the month is forecast to go over.

## Connecting Claude Code (or another MCP client)

1. Get an access token. This opens the sign-in page at `<CognitoDomain>` in your browser; sign in with your AnswerShare account:

   ```bash
   TOKEN=$(npm run -s mcp:token)                # read only
   TOKEN=$(npm run -s mcp:token -- --draft)     # also allow starting drafts
   ```

2. Add the server to Claude Code:

   ```bash
   claude mcp add --transport http answershare <GatewayUrl> --header "Authorization: Bearer $TOKEN"
   ```

3. Ask in plain language, for example:
   - "Where do we stand on invoicing questions this week?"
   - "Which engines stopped naming us since the last run?"
   - "What are our top three gaps and what page would fix the first one?"
   - "Start a draft for the Wise vs Payoneer gap."

The token lasts one hour. When the assistant gets *unauthorized* errors, fetch a new token and replace the server:

```bash
claude mcp remove answershare
TOKEN=$(npm run -s mcp:token)
claude mcp add --transport http answershare <GatewayUrl> --header "Authorization: Bearer $TOKEN"
```

**What the assistant can do**

| Tool | Needs | Does |
| --- | --- | --- |
| list_workspaces | read | Lists your workspaces and their ids |
| get_visibility | read | Latest run per engine and per question, changes, weekly trend, published pages |
| list_gaps | read | Gaps by score with the suggested page |
| get_gap | read | One gap's evidence and brief |
| draft_from_gap | draft | Starts a draft and returns the editor link |

There is no publish tool. A read-only token does not even see `draft_from_gap`. Brand names, links and titles from third-party pages reach the assistant labelled as data, not instructions.

## Command reference

Run from the repo root with the default AWS profile, in your own terminal.

| Command | Does |
| --- | --- |
| `npm run add-user -- EMAIL` | Create a sign-in, or set a new password for one |
| `npm run keys:set` | Store OpenAI, Perplexity and WordPress keys in SSM (blank skips one) |
| `npm run mcp:token [-- --draft]` | Get an MCP access token through the browser |
| `npm run run:now -- "QUESTION" --engines nova` | Ask one question once and print the answer, citations and cost |
| `npm run smoke -- --engines nova` | A 5-question run against real engines, printing its measured cost, then cleaned up |
| `npm run seed` | Create a demo workspace on the fake engine, owned by a placeholder user, for scripts |
| `npm run run:start -- WORKSPACE_ID` | Start a run from the command line and wait for it |
| `npm run dlq:redrive` | Retry gap, sitemap and draft jobs that failed three times |
| `npm run infra:deploy` | Build the web app and deploy |
| `npm run teardown` | Remove the stack, its data, the stored keys and leftover logs |

## Troubleshooting

| Problem | What to do |
| --- | --- |
| *Wrong email or password* | Check the email. The owner can run `add-user` again to set a new password. |
| *This account needs a new password* | The account was created another way. Run `add-user` for that email. |
| `add-user` or `keys:set` says *no terminal to prompt on* | Run it in your own terminal, not through an assistant's shell. |
| Run now is greyed out | A run is in progress, a manual run started less than an hour ago, or no question is active. |
| The run banner says it did not start | Read the reason: over the per-run cap, no active question, or no engine with a key. Reduce questions, engines or samples, or store keys. |
| OpenAI or Sonar are listed as skipped | No API key is stored. Run `npm run keys:set`, or untick them in Settings. |
| A question was rejected | It contains your brand, another name or your domain. Rephrase it the way a buyer who does not know you would. |
| *Your closest pages* is empty | Import your sitemap under Settings, Your pages, then refresh the brief. |
| *Could not read your site* when suggesting questions | Your homepage blocked the fetch (robots.txt, a private address, a timeout or a page over 2 MB). Add questions by hand. |
| Publish stays disabled | A `[fill in]` placeholder is left somewhere: the title, description, body or a question and answer. |
| The crawler check warns | Your `robots.txt` blocks an AI search crawler. Allow it, or engines cannot cite the page. |
| A published page did not move the numbers | Expected for a while: engines must crawl and index it first. Watch the trend over the following weeks. |
| A gap shows *could not finish* | Its job failed three times and you got an alert email. Fix the cause, then run `npm run dlq:redrive`. |
| The assistant gets *unauthorized* | The token expired after an hour. Fetch a new one and re-add the server. |
| No alert emails arrive | Confirm the SNS subscription email AWS sent to the alert address after the first deploy. |
