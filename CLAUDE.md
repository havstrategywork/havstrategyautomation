# Outreach platform: playbook for Claude Code

Next.js + MongoDB internal tool. The app is the database + API; **Claude Code does the hunting and the Instagram sending** (no Anthropic API key in the app).

All `/api/*` calls need `Authorization: Bearer $API_KEY` (from `.env.local`). Base URL: `http://localhost:3000` locally, `APP_URL` when hosted
(https://havstrategyautomation-ten.vercel.app).

## Endpoints
- `GET /api/meta`: the database's real vocabulary (niches, IG categories, locations, tiers, statuses with counts, existing clients). **Read before translating a requirement.**
- `POST /api/search`: requirement -> ranked creators with a per-factor `fit`, `shortfall`, `nearMisses`. See "Requirement intake".
- `GET/POST /api/clients`: client requirements. POST **upserts by name** and only changes the fields you send
  (`niches, related[], locations[], maxRate, tierRates{Nano|Micro|Mid-tier|Macro|Mega: "10k INR"}, minFollowers, maxFollowers, weights, notes`).
- `GET /api/creators?clientId=&niche=&q=&minScore=`: creators, scored and sorted for that client.
- `POST /api/creators`: upsert one creator or an array. Safe to re-push (dedupes on `igHandle`/`email`).
  Fields: `name, igHandle|igUrl, email, niches[], followers, engagementRate (%), platforms[], collab{count,rating 0-5,notes}, notes, source`.
- `PATCH /api/creators/:id`: update fields.
- `POST /api/outreach` `{creatorId, clientId?, igMessage?}`: queues an IG DM. Skips creators already queued/sent. **Email outreach is switched off.**
- `GET /api/outreach/next`: queued IG DMs for now (first DMs and due follow-ups, `followUp:true`), already limited to today's remaining cap (75/day).
- `POST /api/outreach/:id/sent` `{ok:true}` or `{ok:false,error}`: report the result. Returns 429 once the cap is hit; stop immediately.
- `GET /api/briefs?status=new`: campaign briefs from the dashboard chat (with `clientDoc`). `POST /api/briefs/:id/claim` takes one (409 = taken).
  `POST /api/briefs/:id/shortlist {items:[{creatorId,tier,score,why}]}` proposes creators (moves it to awaiting approval; if the client has a saved `dmTemplate` and `AUTO_APPROVE` isn't `off` the server then approves it itself, reply `autoApproved:true`; otherwise it pings the human).
  `PATCH /api/briefs/:id {draftMessage?, note?, status?:"failed"}`.
- **Campaign priority** (`high` | `normal` default | `low`, stored on the client as `priority`, set with the dropdown on each Campaigns card or `POST /api/clients {name, priority}`): it only changes ORDER. `/api/outreach/next` hands out high-priority campaigns' DMs and follow-ups first (then follow-ups before first DMs), so under the daily cap they go first; `/api/conversations?view=pending`, `/api/messages/next` list high-priority threads/replies first, and `view=watch` reads live chats first, then high-priority ones. Each item carries `priority`. Work through the lists in the order given. Nothing is skipped and caps are unchanged. Approving, "find more" and archiving are dashboard-only (a human).

## Hunting new creators
1. `GET /api/clients` to see what's wanted.
2. **Prefer Meta's Creator Marketing Hub** (`business.facebook.com/creator_marketing_hub/creator_discovery`, via Claude in Chrome, logged into the
   brand's Meta Business account) when that tab is open: it's Meta's own creator-discovery tool, so followers/views/the "Interactions" % are real
   numbers straight from Meta, not guesses. Switch the business selector (top right) to the right client first if more than one is connected. Use
   its filters (category, follower range, country) to match the requirement, open each card for the IG handle, and read followers/engagement rate
   straight off the page. Fall back to web search / open Chrome for niches or handles it doesn't surface. Either way, for each creator collect: IG
   handle, follower count, engagement rate, niches, and (as contact info only) a **public** email if shown (bio, linked site, Linktree, YouTube About
   page). Never guess or fabricate emails or numbers. Leave a field out if you can't verify it. Don't use the Hub's own "Contact" button — creators
   still go through our own queue (`POST /api/outreach` / the hunt-then-search flow below), so caps, templates and no-double-contact rules apply.
3. `POST /api/creators` with `source: "claude-hunt"` (or `"creator-marketing-hub"` when found there) and short `notes` on why they fit.

## Sending IG DMs (Claude in Chrome)
1. `GET /api/outreach/next`. If `remaining` is 0, stop.
2. For each item: open `igUrl` in a new tab, click Message, type `message`, send, then `POST /api/outreach/:id/sent`.
3. Wait a random 60-180s between DMs. Do not burst. If Instagram shows a challenge, action block, "try again later" or a login wall, stop the run, report `{ok:false}` for that item, and tell the user.
4. Never exceed the cap; never retry a `sent` item.
5. **No double contact.** The server never queues a second message to a creator who was already queued/sent one (for any client). Still, before
   typing, glance at the thread: if our account has already messaged them, don't send, report `{ok:false,error:"already contacted"}`.
   Send at most one message per creator per run.
6. **Follow-ups** (`followUp:true` items): up to 2 per creator, on day 3 and day 6 after the first DM (`FOLLOWUP_SCHEDULE`, default `3,6`; empty = off),
   only while the creator never replied. The client's `followUpTemplate` holds one text per step, separated by a line of `---` (step N uses text N; a
   step with no text is skipped). A client with no text of its own gets the 2 standard ones (`DEFAULT_FOLLOWUPS`, so it is ON by default; the second is the final one); the text `none` turns it off for that client. The server queues them by itself (never two within 24h, due ones go first) and cancels them the moment a reply is logged.
   Type it in the existing chat; if the creator has replied there, report `{ok:false,error:"creator replied"}` instead.

## Writing messages
**If the client has a `dmTemplate` (the user's pasted message), never write your own first message.** Queue with `POST /api/outreach
{creatorId, clientId, useTemplate:true, name}`; the server fills only `{{name}}`/`{{handle}}` and sends it as the IG DM.
Only when there is no template: personalise from the creator's `notes` and past `collab` info. Keep DMs under ~400 chars and say who we are and the ask clearly.

## Creator fields (match the team sheet)
`igHandle` (or `igUrl`), `name`, `followers`, `igCategory`, `location`, `email`, `notes` (from bio), `status`
(New, DM Sent, Replied, Negotiating, Agreed, Declined), `response`, `quotedRate`, `agreedRate`, `outreachNotes`,
`phone`, `contactSource` (where you found the email/phone), `lastChecked` (auto = now on every push), `followUpSentAt`.
Plus scoring inputs: `niches[]`, `engagementRate`, `collab{count,rating,notes}`.
**Derived, don't send:** Tier (Nano <10k, Micro 10k-100k, Mid-tier 100k-500k, Macro 500k-1M, Mega 1M+), Times Suggested,
Profile Link. `suggestedVia` is set automatically when you queue outreach with a `clientId`.
`dmSentAt` and status -> "DM Sent" are set automatically when `/api/outreach/:id/sent` reports ok.
After a creator replies: `PATCH /api/creators/:id` with `{status:"Replied", response:"..."}`; set `quotedRate`/`agreedRate` (text with currency, e.g. "10k INR") when discussed.
CSV import/export is in the UI (Creators page). Dates are DD/MM/YYYY or YYYY-MM-DD.

## Requirement intake (when the user describes what a client wants)
The user's requirement may be vague, loose or messy. Turn it into a search like this, **in order**:

1. `GET /api/meta` to see which niches/categories/locations actually exist.
2. **Translate** the requirement into structured fields, using that vocabulary:
   - `niches`: the 1-3 core niches, using the DB's own words where there's a match ("gym people" -> `fitness`).
   - `related`: adjacent/loose terms and synonyms (`gym, workout, wellness, powerlifting`). Earns partial credit.
   - `locations` from any place mentioned; `maxRate` from any budget; `want` from any count (default 20).
   - Follower size from words: nano <10k, micro 10k-100k, mid-tier 100k-500k, macro 500k-1M, mega 1M+. "Small/up-and-coming" = micro,
     "big/established" = macro. If no size is given, leave the range open (0 to 1e9).
   - Don't invent constraints the user didn't imply.
3. **Auto-save the client**: `POST /api/clients` with a short name (brand/campaign) and those fields. Later work (outreach `clientId`,
   "Suggested via") attaches to it.
4. `POST /api/search` with `{clientId, want}`. Ranking is soft (niche, followers, engagement, collab, location), so a loose requirement
   still returns the closest matches. A creator with zero niche relevance is never returned.
5. Reply with: **the assumptions you made** (one short list, at the top), the ranked results (score, handle, followers, tier, location, whether
   IG/email is available, status), and `nearMisses` if the list is thin. The user can correct an assumption; then re-run step 3-4.

**How vague is too vague?** Assume and run. Only stop and ask, once, max 3 short questions, when there is **no niche, category, product
or audience to work from at all** (e.g. "find me good creators"). Ask: what product/niche? where is the audience? size/budget?

**Hunt rule: fewer than 15 creators scoring above 80 means hunt.** `/api/search` returns `strong.count` (on-topic creators with a score strictly
above 80, so exactly 80 doesn't count) and `shortfall = 15 - strong.count`. If `shortfall` > 0, auto-hunt, capped: find up to
`min(shortfall, 20)` new creators (see "Hunting"), push them with `POST /api/creators`, then run the same search **once more**. Do not loop
further. Tell the user how many strong creators there were before and after, and how many were hunted.
If it is still under 15 after that, say so plainly; don't pad the list with weaker or off-topic creators. The thresholds default to 80 and 15; change
them only if the user says so (`strongScore`, `strongCount` in the search body). The list returned for outreach is still every on-topic creator
above `minScore` (40), not only the strong ones: ask the user if they want to contact only creators above 80.

Never lower `minScore` or drop the niche to make the numbers look better. Never fabricate creators, emails or stats.

## Getting the right creators first time (client direction, changes, vetting)
`/api/search` scores only the structured fields (niches, related, followers, engagement, collab, location). It **ignores the client's `notes`
and has no exclusion list**, so style, audience, region, brand fit and "client rejected X" never affect the score. A high score is therefore a
shortlist, not a verdict: you must vet against the `notes` yourself.

**Before any search, hunt or shortlist:** `GET /api/clients`, read the client's `notes` and `offer` in full, and write down the
*must-haves* (style, audience, region, persona, product fit), the *rejected* handles/lists, and any *reference creators*.

1. **Latest client direction wins.** When the client changes direction, corrects a list or rejects creators, `POST /api/clients` with
   `notes` updated (it replaces the field, so resend the full text): keep the old context, add one dated line, e.g.
   `CLIENT DIRECTION (Nov 2026): <what changed>` and `REJECTED: @a, @b, earlier list (<why>)`. Then fix the structured fields to match
   (`niches`, `related`, `locations`, `min/maxFollowers`, `weights`) and re-run the search. Never leave `notes` and the fields disagreeing.
2. **Rejected creators never come back.** Before proposing, queuing or hunting, drop every handle in `REJECTED` and anyone who resembles
   the rejected set for the same reason (e.g. the client said "not modest luxury": don't re-offer that look). Also skip `Declined` status.
3. **Vet every candidate against the must-haves** by opening the profile (Creator Marketing Hub card or Chrome), not by score alone:
   does the grid, bio and audience actually match the notes? Drop failures. Put a one-line `why` per kept creator
   (what in their content meets the must-have). If you can't verify a must-have, leave them out of the shortlist rather than guess.
4. **Reference list = benchmark.** If the client shared example creators, store the handles in `notes`, read what they have in common
   (look, tone, audience region, size) and hunt lookalikes. Don't re-pitch the reference creators themselves unless told to.
5. **Check the requirement agrees with itself** before spending outreach: follower range vs size mentioned in `notes`, budget set for the
   tiers you'll actually contact (`tierRates`/`maxRate`), currency, location vs the audience wanted. If they conflict, don't pick silently:
   state the conflict and the assumption you used at the top of the reply (or ask once if it changes who gets contacted).
6. **Say what changed.** When a client changes the requirement, tell the user which creators in the current list no longer fit and why,
   before queuing anything new. Don't DM anyone the old requirement produced if it conflicts with the new one.

### Standing requirements per client (keep in step with the client's `notes`; the database is the source of truth)
- **ORFA** (luxury fashion, GCC): a **modest luxury** label. Creators must look elevated, elegant and modest in dress and presentation.
  Core market UAE/GCC/Arab region: prefer Arab/Khaleeji modest-fashion profiles over generic fashion bloggers. Fit and quality beat follower
  count; the range is 75k-250k. The client already rejected an earlier Indian-creator list (Anjali, Kashish, Vridhi), so never re-offer those
  or that profile type. A reference blogger list from the client is the benchmark (see rule 4). Offer: 1 Reel + 1 Story + 1 month paid-ad
  usage rights; nothing else is decided. Never reveal the budget ceiling.
- **Nuume** (daily nutrition gummy sachet, India; the brief may be written "Nuoria"): nutrition / gut health / fitness / wellness creators
  whose audience is busy urban professionals aged 24-40. Competitors are Wellbeing Nutrition, OZiva and Supply6: note any creator who already
  promotes them and flag it to the user. Offer: 1 Reel + 1 Story + usage rights to run the Reel as a paid ad (it may also go on the website).
  **Open conflict to resolve:** `notes` ask for micro creators 7k-46k, but the saved `maxFollowers` is 10,000 and only a Nano rate (6k INR)
  is set. Confirm the real range and rates for Micro before widening the search or quoting anyone above 10k followers.
- Any other client: apply rules 1-6 the same way; add a short entry here only for requirements that are specific and likely to change.

## Conversations (replying to creators)
Replies are handled by Claude via Claude in Chrome, on a schedule (every ~15 min). The app stores the thread; Chrome only reads and types.

**Each run:**
1. `GET /api/conversations?view=watch`: the ONLY creators whose Instagram threads you may open (`?limit=15`, once per run; live conversations first, then whoever was read longest ago; each call rotates to the next batch, so the hourly runs cover everyone over time).
   **Never search or scroll the inbox**: it is shared with other clients and shows display names, so you would match the wrong person. Open each entry's `igUrl`
   (their profile) and click Message: that opens exactly their chat. Check the header is the same profile; if you can't confirm it, skip that creator. Never read, open,
   or reply to anyone not on this list (private messages, friends, other business). Not finding a chat is never a reason to pause: pause is only for Instagram restrictions.
2. **Sync every thread, both sides, oldest first.** Each watch entry has `lastLogged` (the newest message already in our log). In the
   Instagram thread, find that message and take **everything after it**, in order:
   - a message from the creator -> `POST /api/messages {direction:"in", igHandle, text}`
   - a message from our account -> `POST /api/messages {direction:"out", by:"human", igHandle, text}`. You can't tell your own earlier
     replies from a person's, so just post them all; the server ignores any that Claude already sent, so only genuinely human-typed replies get recorded.
   If `lastLogged` is null, post the thread from the beginning. Re-posted messages are ignored.
3. `GET /api/conversations?view=pending`: threads where **the creator spoke last**. A thread where a human (or Claude) already answered
   is NOT listed, so **skip it. Do not reply to it, not even to add something.** It reappears here only when the creator writes again.
   For each pending one, read the whole `thread`, the `client` (`offer` = your brief, `tierRates`/`maxRate` = hard ceiling, see "Money") and decide.
   A pending entry may carry `guidance`: the instruction a human typed on the Inbox when handing the thread back. Follow it (ceiling and escalation rules still win); no `guidance` = you decide. It is cleared once a reply is posted.
4. Reply: `POST /api/messages {direction:"out", igHandle, text, price?}`. **Put any price you state in `price` (e.g. "10k INR")**; the server refuses
   anything above the ceiling (422), so counter lower or escalate.
5. `GET /api/messages/next`: before typing each one, **look at the end of that thread in Chrome**. If the last message is not the creator's
   (a person just answered) or a newer creator message has arrived, do NOT send it: `POST /api/messages/:id/sent {ok:false,error:"thread moved on"}`
   and let the next run handle it. (The server also drops replies superseded by anything newer it knows about.) Otherwise send it in the existing
   thread, then `POST /api/messages/:id/sent {ok:true|false,error}`.
   Wait a random 20-90s between replies; if Instagram shows a challenge or block, stop the run and tell the user.

**How to talk:** short, warm, specific to what they said. Write as the brand's marketing team, not a named individual. Don't mention being
an AI unprompted. **If a creator sincerely asks whether they're talking to a bot/AI/real person, answer honestly:** you're an AI assistant
working with the brand's marketing team, then continue helping. Never claim to be human. Never make up facts: product, deliverables, dates,
payment terms come only from the client's `offer` brief. If the brief doesn't cover a question, escalate.

**Money format:** every amount is text with a currency, e.g. `"10k INR"`, `"1.5 lakh INR"`, `"800 USD"` (a bare number is rejected). This applies to
`maxRate`, `tierRates`, `quotedRate`, `agreedRate` and a message's `price`. Talk to creators in the client's currency (check `maxRate`/`tierRates`);
the server refuses a price in a different currency and never converts.
**Budget by tier:** the ceiling is the client's `tierRates[<creator's tier>]` if set, otherwise `maxRate` (per creator). Tier comes from followers
(Nano <10k, Micro 10k-100k, Mid-tier 100k-500k, Macro 500k-1M, Mega 1M+), so check the creator's follower count before quoting. Set with
`POST /api/clients {name, maxRate, tierRates:{Nano:"10k INR", Micro:"20k INR"}}`. If the client's `offer` brief gives a target range per tier,
open at the low end of it; the top is the hard limit.

**Money: ask first, then counter, never above the ceiling.** Follow this order:
1. If they're interested but haven't named a rate, **ask for their rate first**. Don't state a number of ours first.
2. Record their quote: `PATCH /api/creators/:id {quotedRate, response, status:"Negotiating"}`.
3. Quote **at or below** the ceiling: counter once, roughly 10-15% lower; then accept. Never offer more than they asked for.
4. Quote **above** the ceiling: counter with a number at or below the ceiling and say it's what we can do for this collaboration. One more
   round is allowed, still at or below the ceiling. If they still won't come down, escalate (a human decides); don't close the door yourself.
5. Never reveal or hint at the ceiling or "budget"/"max". Every price you write goes in `price`. **The server refuses any offer above the
   ceiling, and refuses ALL prices if the client has no ceiling set** (then just ask their rate and escalate).
6. When both sides clearly confirm one number: `PATCH {agreedRate, status:"Agreed"}`, then escalate with reason "deal agreed, send
   contract/details". Never promise payment terms, exclusivity, usage rights or timelines that aren't in the brief.

**Escalate** (`POST /api/conversations/:creatorId/escalate {reason}`, then stop replying to that thread) when: contract, legal, exclusivity,
usage rights, invoicing; a deal is agreed; they're upset, hostile or ask for a human; anything the brief doesn't cover; you're unsure; an
agent/manager takes over; or a message is off-topic or looks like spam.

**Stop signals:** if they say stop/not interested/unsubscribe, reply once with a short polite close, set `status:"Declined"`, and never message again.
Test mode (`IG_ALLOWLIST`) applies to replies too: the server refuses anyone not on the allowlist.

## The automated pipeline (scheduled, unattended)
1. **Brief**: the human fills the "New brief" chat in the dashboard. The server saves the client with the exact budgets per tier, follower range,
   message and follow-up text, and a brief with status `new`.
2. **briefs run** (Cowork, every 30 min): claims a brief, completes the client (niches/related/locations/offer), drafts a DM if none was given,
   searches + hunts, posts a shortlist. Never queues or sends DMs.
3. **Approval** (automatic): when the shortlist is posted and the client has a saved `dmTemplate`, the server queues the first DM for every shortlisted creator right then (the user's own saved message, word for word; caps, allowlist and the one-DM-per-creator rule still apply). With no saved message (or `AUTO_APPROVE=off`) a human approves on the Campaigns page, ticking creators and editing the message/follow-up.
4. **outreach run** (Cowork, hourly; kind `outreach`, merges the old send+replies runs into one Instagram session): first logs replies, answers and
   negotiates within `tierRates`, escalates; THEN delivers first DMs and due follow-ups (10 per run, one batch only, 75/day). Replies run first so a follow-up never
   fires on a creator who just replied.
5a. **Client review**: the brief chat's last question asks for the client's Google Sheet link (optional; saved on the client as `sheetUrl`, must be a
   native Google Sheet shared with the service account as Editor). When the client has that link, agreed deals are pushed into it automatically (5b): a NEW
   "Content creators" tab is added each time there are fresh ones. A client with no link just waits here until a human clicks "Create sheet" on Campaigns
   (manual only in that case — it makes a fresh sheet). Either way, nothing is posted anywhere automatically: a human reviews the sheet, gives it to the
   client themselves and clicks "Mark given to client". When the client sends it back, the human uploads it as `.xlsx` or `.csv` ("Upload client's answers";
   for an `.xlsx` the first tab with a Decision column is read, rows match by id or Instagram handle). That is the only way Yes/No enters the app: the app
   never reads the Google Sheet and never posts to Slack. The guidelines/terms email itself (`guidelinesTemplate`) is written and saved on the Campaigns
   page per campaign, any time — not only once a deal is agreed. From there a human can also download that review sheet as a real `.xlsx` file
   ("Download .xlsx" next to "open sheet"), and edit a campaign's own details (products, creator rows/budgets, currency, other requirements, sheet
   link — same form as the "New brief" chat) or delete it (only once archived; the creators/outreach/messages it produced are untouched).
5b. **guidelines run** (Cowork, hourly, no Chrome): `POST /api/deals/run` first pushes agreed deals into every client's own sheet that already has a `sheetUrl`
   (skips clients with none), then emails the client's saved `guidelinesTemplate` to every creator the client said Yes to (via the upload) and
   who was not yet emailed (once ever; `EMAIL_ALLOWLIST`, `EMAIL_DAILY_CAP` apply). That email can also carry two attachments, both optional and set on
   the Campaigns page: a static brand-guidelines/deck file (PDF/PPTX, uploaded once via UploadThing, same for every creator) and a personalized Terms
   PDF (a master Google Doc with `{{name}}`/`{{brand}}` placeholders, copied and merged per creator via the Docs API, then exported to PDF and the
   copy deleted). Claude never writes that email; it only triggers the endpoint. It does not use `/api/run/start`, so the Instagram pause/lock don't affect it.
6. **Notifications** (`NOTIFY_URL`: ntfy topic, Discord or Slack webhook): pause, failed run/brief, shortlist ready, escalation, deal agreed.

The three scheduled prompts live in `lib/prompts.ts` and are shown, with the real URL and key filled in, on the dashboard's **Automation** page
(also a setup checklist and a test-notification button). Rules for EVERY run:
1. `POST /api/run/start {kind}` first (`briefs` | `outreach`). **423 = paused, 409 = another run is active: stop and do nothing.**
   One run at a time (one Instagram account, one Chrome). A crashed run frees the lock after 20 min (60 min for `briefs`).
2. If Instagram shows a challenge, action block, "try again later", login wall or anything odd: `POST /api/pause {reason}`, end the run
   with `ok:false`, stop. **There is no API to resume: only a human can, from the dashboard. Never try to work around a pause.**
3. Finish with `POST /api/run/end {runId, ok, note}`, even on failure.
4. The server hands out nothing while paused (`/api/outreach/next`, `/api/messages/next` return empty), so don't try to send anyway.
The dashboard "Worker" card shows the last run; if it says "No recent run" the schedule has stopped.

## Dashboard login
The UI needs a login (`proxy.ts`): DB-backed sessions (7 days, 24h idle, revocable on logout), scrypt-hashed password in the `users` collection, account lockout after 10
wrong passwords (5 min, doubling, max 1h), per-IP limit, CSRF origin check, security headers (`next.config.ts`). `/api/*` is NOT behind the login: workers use the Bearer
`API_KEY` (needs 8+ chars; the server refuses everything if it is unset). Create or reset a user (also signs them out everywhere and clears a lockout):
`HAV_PW='long passphrase' node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>`

## Roles and the Email dashboard
Dashboard logins have a `role` (`lib/roles.ts`): `admin` (everything; a user with no role saved is admin), `outreach` (creator pages, no Email/Users/Automation), `mail` (only `/mail`).
`proxy.ts` enforces it per path; the mail role never gets `BriefChat` (it carries `API_KEY`). Admins create/edit/delete logins on `/users` (the `set-user.mjs` script still works and makes admins).
The email agent (Hostinger webmail, its own scheduled prompt) reports with `POST /api/mail/threads` (Bearer): `{threads:[{mailbox:"info"|"editorial", email, subject, status, name?, category?, price?, note?, url?, followUpSent?}], run?:{ok,note}}`.
Upserts by mailbox + sender + subject; `GET /api/mail/threads` lists open ones. It does NOT use `/api/run/start` (no Instagram lock/pause). The full email-agent prompt (with the report step) is on the Automation page ("4. Email agent").

## Social-media dashboard
Role `social` = the SM team (`/social/*`; `/social/orgs` and `/social/connect` are admin-only). Every SM user sees every org. An org = one client; its Instagram accounts are Meta connections (`botConnections`, token encrypted via `lib/secrets.ts`
with `SECRETS_KEY`, falling back to `API_KEY`) made by an admin through Meta "Unified Login" (Organizations > Connect Instagram). That connection now powers the Chat bots only.
Reports (`/social/reports`) read **Buffer's** GraphQL API live (`lib/buffer.ts`, `https://api.buffer.com`, personal API keys from publish.buffer.com/settings/api; a key reaches every org/channel in its Buffer account. The shared one is `BUFFER_API_KEY`; a client with their own Buffer account gets their own key, pasted by an admin on Organizations, checked against Buffer, stored sealed as `orgs.bufferKey` (`lib/bufferKeys.ts`, `lib/secrets.ts`) and never shown again). An admin links Buffer channels to an org on Organizations (stored on the org as `orgs.buffer[]`; channel details are re-read from Buffer, never from the form). Per channel, side by side: summary numbers with change vs the previous period (`aggregatedPostMetrics`: posts, reach, impressions, views, reactions, comments, shares, saves, reposts, clicks, follows, engagement rate) and top posts by interactions. Ranges up to 365 days (Buffer's limit; the comparison period is skipped if it would start >2 years back). Buffer gives per-post metrics only (refreshed ~daily, "experimental", personal key only), so there is NO follower count or audience data. Plans: Free = 3 channels, Essentials = $5/channel/month billed yearly ($6 monthly); API on every plan (Free: 150 calls/15 min). The Meta Insights version (`lib/igreport.ts`) is in git history.
Date range 7/30/90 or custom (max 90 days; Meta requests are split into 30-day windows, distinct-account metrics are averaged across windows), CSV export, PDF = browser print. Each section fails on its own with Meta's message.
Planner (`/social/planner`, `lib/buffer.ts` bottom + `app/(main)/social/planner/actions.ts`, `components/PlannerBoard|PlannerComposer.tsx`): a month **Calendar** (by `dueAt`, India time) and a drag-and-drop **Kanban** (Drafts / Needs approval / Scheduled / Sent last 14 days / Failed) that create, schedule, reschedule, move draft<->scheduled and delete posts through Buffer's `createPost` / `editPost` / `deletePost`. Instagram needs media (Buffer refuses text-only); media is uploaded through UploadThing (`socialMedia` route) or pasted as a public https link, because Buffer fetches it from the URL when the post goes out. Actions re-check the role and that the post's channel is linked to one of our orgs. Verified live against the real API: create draft, draft->scheduled->draft, reschedule, delete. A feed post can hold up to 10 images/videos (a carousel, in the order shown). Reels: the cover is a FRAME picked on a slider (`thumbnailOffset`); Buffer rejects custom video thumbnail images, so an uploaded cover image works only with reminder publishing, where its link is put in Instagram `stickerFields.other` for the person publishing. Carousels, frame covers and cover links are untested against the real Buffer API.
NOT built: publish-now, editing a post's caption/media, Facebook/other-network metadata (only Instagram gets `metadata`).
NOT built: daily charts, follower growth over time, audience demographics (Buffer does not provide them). Old `orgs.metricool` / `socialAccounts` data in Mongo is unused and can be dropped.
Chat bots (Step 3, `/social/bots`): rule/flow builder with a drag-and-drop canvas (`components/FlowEditor.tsx`); nodes = trigger (keywords, empty = every message), message (text/image/buttons/carousel), question (saves `{{var}}`, quick answers).
Pure engine in `lib/botflow.ts` (validation = Meta's limits, payload shapes, matching), runtime in `lib/bot.ts` (session row only while a question waits; no message log), Meta client `lib/meta.ts`.
Connecting accounts is admin-only (Organizations > Connect Instagram = Meta Unified Login, callback `/api/meta/callback`, webhook `/api/meta/webhook` signature-checked). The OAuth callback lives under /api because the session cookie is SameSite=Strict.
`scripts/test-connection.mjs "<org>"` adds a fake (test:true) connection so the builder can be tried without Meta. Untested against real Meta (no app yet): token expiry/refresh, webhook subscription call, App Review.

## Dropdowns and calendars (Material UI)
Every dropdown and date picker uses Material UI (`@mui/material` 9, `@mui/x-date-pickers` 9 + dayjs), wrapped in `components/mui/`: `Select` (submits `name` like a native select; controlled via `value`/`onChange`, `compact`, per-option `disabled`), `DateField` (shows DD/MM/YYYY, submits `YYYY-MM-DD` through a hidden input, empty = no date) and `DateRange` (linked From/To). Never use a native `<select>` or `<input type="date">`.
The theme (`components/mui/Providers.tsx`) reuses the app's CSS variables and the `data-theme` light/dark switch (`themeScript` always sets `data-theme`; MUI reads the same `theme` localStorage key).
The global element styles for `input/select/textarea/button` in `globals.css` skip anything inside `.mui-scope` and MUI's popups (`.MuiPopper-root` etc.), so they don't leak into MUI's own elements.

## Access Hub (same app, same login, same MongoDB)
The Havstrategy Access Hub (client OAuth onboarding for Meta Ads, Instagram, Google Ads, Google Analytics 4, Google Tag Manager and Shopify; no others) lives under `/access/*`, with its tabs in the sidebar below System
(`lib/nav.ts`). **There is one login**: the dashboard's (Users page or `set-user.mjs`; users also have an optional `email`, and you can sign in with it). Hub access follows the
dashboard role (`hubRoleOf` in `lib/roles.ts`): `admin` = Hub super admin, `outreach` = Hub account manager, `mail`/`social` = no Hub access. There is no separate Hub user table: the people ARE the
dashboard `users` (`lib/access/db/queries/users.ts`); the Hub's Team page adds/edits/removes those same logins (admin / outreach only).
- Code: `app/(hub)/access/**` (own root layout + Tailwind, so its CSS never touches the dashboard; the dashboard pages live in the `app/(main)` group), `app/api/access/**`, `lib/access/**`, `components/access/**`.
- **Data: the same MongoDB** (`MONGODB_URI`), in its own `hub_*` collections (`hub_organizations`, `hub_clients`, `hub_invitations`, `hub_connections`, `hub_assets`, `hub_access_requests`, `hub_credentials` (encrypted tokens),
  `hub_audit_logs`, `hub_notifications`, `hub_analytics`); typed handle `lib/access/db/index.ts`, document shapes `schema-types.ts`, queries `db/queries/*`. Indexes are created on first use; no migration step, no second database.
- Integrations: one adapter per platform in `lib/access/integrations/*`, listed in `PLATFORMS` (`lib/access/types.ts`), scopes per permission preset in `config/permission-presets.ts`. Google access tokens and Shopify offline tokens
  expire after about an hour, so provider calls go through `getFreshAccessToken` (`integrations/fresh-token.ts`). GA4 / Tag Manager "agency access" = adding `GOOGLE_AGENCY_EMAIL` to the chosen property / container;
  Google Ads = a manager-account link: an admin connects the agency's MCC once on Access Hub > Integrations (refresh token encrypted in `hub_agency_credentials`, `google-ads/agency.ts`), the invitation is sent and checked with THAT token (never the client's), and the client accepts it in Google Ads.
  Needs `GOOGLE_ADS_MANAGER_CUSTOMER_ID` and Basic API access on the Cloud project; no developer token;
  Shopify = the client types their `*.myshopify.com` domain and installs the agency app (callback HMAC-checked, expiring offline tokens). Google Ads, GA4, Tag Manager and Shopify are untested against live accounts.
- `APP_MODE` only picks the OAuth providers: `demo` (default locally) = simulated Meta/Google authorization screens, `production` (default on Vercel) = the real providers.
  Production needs `SESSION_SECRET` (signs the OAuth state), `TOKEN_ENCRYPTION_KEY_REFERENCE` (AES key for stored tokens, `openssl rand -base64 32`) and `CRON_SECRET` (`/api/access/cron/*`), plus the Meta/Google app credentials.
- Public (no login): `/access/onboard/*` (the link we send clients), `/access/privacy|terms|security|contact|data-deletion`, and `/api/access/public|oauth|cron` (token / CRON_SECRET).
  The OAuth redirect URI to register with Meta/Google is `<APP_URL>/api/access/oauth/<platform>/callback`. Other env vars: `.env.example`.

## Client onboarding form (public `/onboarding`)
Answers go **straight to the Google Sheet** saved on Settings and are **not stored in the database** (`lib/onboardingSheet.ts`; needs `GOOGLE_SA_JSON`, sheet shared with the service account as Editor). The form says "received" only after Google accepted the row; otherwise it returns an error, the client's draft stays in their browser, and `notify` pings the team. With no sheet or key the form can't accept answers.
Values are matched to sheet columns by question text: existing columns never move, new or reworded questions get a new column at the end. The only thing kept in MongoDB is a hashed address + time for an hour (`onboardingHits`, 5 per hour). Uploaded files live in UploadThing; the sheet holds their links.
`/onboarding-responses` only links to the sheet. Responses saved before this change may still be in the old `onboarding` collection, which no code reads.
Questions are edited on **Form editor** (`/onboarding-form`, in the dashboard sidebar; the public form has no link to it), by ONE login only: `havstrategy`, the team's single dashboard login (`FORM_ADMIN` in `lib/roles.ts`). That account is protected: the Users and Hub Team pages can't delete it or change its role, and only it can change its own password (`set-user.mjs` still can): sections, questions, order,
which services show them; saved to the `onboardingForm` collection (`lib/onboardingForm.ts`), with `DEFAULT_STEPS` (`lib/onboarding.ts`) used until the first save. `name`, `email`, `company` are locked
(notifications and the Notion brief rely on them). The five services themselves are fixed in code. The Notion brief (Settings) is built from the submission as it arrives (no retry if Notion is down) and only picks up the original question ids.
