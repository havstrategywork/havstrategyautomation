# Outreach platform: playbook for Claude Code

Next.js + MongoDB internal tool. The app is the database + API; **Claude Code does the hunting and the Instagram sending** (no Anthropic API key in the app).

All `/api/*` calls need `Authorization: Bearer $API_KEY` (from `.env.local`). Base URL: `http://localhost:3000`.

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
- `GET /api/outreach/next`: queued IG DMs for now, already limited to today's remaining cap (45/day).
- `POST /api/outreach/:id/sent` `{ok:true}` or `{ok:false,error}`: report the result. Returns 429 once the cap is hit; stop immediately.

## Hunting new creators
1. `GET /api/clients` to see what's wanted.
2. Use web search / Claude in Chrome to find creators matching the niche. For each, collect: IG handle, follower count, rough engagement rate, niches, and (as contact info only) a **public** email if shown (bio, linked site, Linktree, YouTube About page). Never guess or fabricate emails or numbers. Leave a field out if you can't verify it.
3. `POST /api/creators` with `source: "claude-hunt"` and short `notes` on why they fit.

## Sending IG DMs (Claude in Chrome)
1. `GET /api/outreach/next`. If `remaining` is 0, stop.
2. For each item: open `igUrl` in a new tab, click Message, type `message`, send, then `POST /api/outreach/:id/sent`.
3. Wait a random 60-180s between DMs. Do not burst. If Instagram shows a challenge, action block, "try again later" or a login wall, stop the run, report `{ok:false}` for that item, and tell the user.
4. Never exceed the cap; never retry a `sent` item.
5. **No double contact.** The server never queues a second message to a creator who was already queued/sent one (for any client). Still, before
   typing, glance at the thread: if our account has already messaged them, don't send, report `{ok:false,error:"already contacted"}`.
   Send at most one message per creator per run.

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

## Conversations (replying to creators)
Replies are handled by Claude via Claude in Chrome, on a schedule (every ~15 min). The app stores the thread; Chrome only reads and types.

**Each run:**
1. `GET /api/conversations?view=watch`: the ONLY creators whose Instagram threads you may open. Open the inbox, find these handles,
   and **ignore every other thread**. Never read, open, or reply to anyone not on this list (private messages, friends, other business).
2. **Sync every thread, both sides, oldest first.** Each watch entry has `lastLogged` (the newest message already in our log). In the
   Instagram thread, find that message and take **everything after it**, in order:
   - a message from the creator -> `POST /api/messages {direction:"in", igHandle, text}`
   - a message from our account -> `POST /api/messages {direction:"out", by:"human", igHandle, text}`. You can't tell your own earlier
     replies from a person's, so just post them all; the server ignores any that Claude already sent, so only genuinely human-typed replies get recorded.
   If `lastLogged` is null, post the thread from the beginning. Re-posted messages are ignored.
3. `GET /api/conversations?view=pending`: threads where **the creator spoke last**. A thread where a human (or Claude) already answered
   is NOT listed, so **skip it. Do not reply to it, not even to add something.** It reappears here only when the creator writes again.
   For each pending one, read the whole `thread`, the `client` (`offer` = your brief, `tierRates`/`maxRate` = hard ceiling, see "Money") and decide.
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
**Two people, one database:** `OWNER` (in `.env.local`, e.g. `OWNER=akshit`) limits this app to creators it owns, even when both people work the same client.
Queueing a DM claims an unowned creator for OWNER. When set, the server only lists, queues, sends, logs or replies for creators owned by OWNER; everyone else is
invisible (watch/next/pending) or refused (403 "creator belongs to another person"). A 403 like that means: skip the creator, never open the thread. The other
person sets their own `OWNER` in their own copy of the app.

## Scheduled runs (unattended)
Runs are started by Cowork's scheduler using the prompts in `prompts/` (replies, send-batch, hunt). Rules for EVERY run:
1. `POST /api/run/start {kind}` first. **423 = paused, 409 = another run is active: stop and do nothing.**
2. If Instagram shows a challenge, action block, "try again later", login wall or anything odd: `POST /api/pause {reason}`, end the run
   with `ok:false`, stop. **There is no API to resume: only a human can, from the dashboard. Never try to work around a pause.**
3. Finish with `POST /api/run/end {runId, ok, note}`, even on failure. A run that crashes frees its lock after 20 min.
4. The server hands out nothing while paused (`/api/outreach/next`, `/api/messages/next` return empty), so don't try to send anyway.
The dashboard "Worker" card shows the last run; if it says "No recent run" the schedule has stopped.

## Dashboard login
The UI needs a login (`proxy.ts`): DB-backed sessions (7 days, 24h idle, revocable on logout), scrypt-hashed password in the `users` collection, account lockout after 10
wrong passwords (5 min, doubling, max 1h), per-IP limit, CSRF origin check, security headers (`next.config.ts`). `/api/*` is NOT behind the login: workers use the Bearer
`API_KEY` (needs 8+ chars; the server refuses everything if it is unset). Create or reset a user (also signs them out everywhere and clears a lockout):
`HAV_PW='long passphrase' node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>`
