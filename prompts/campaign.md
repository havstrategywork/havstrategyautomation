Read CLAUDE.md fully (especially "Requirement intake", "Sending IG DMs", "Scheduled runs"). App: http://localhost:3000, API key = API_KEY in .env.local.

=== REQUIREMENT ===
<paste what you want: the brand/product, the kind of creators, how many, location, size, anything else>

=== MESSAGE (send exactly this, only the creator's name changes) ===
<paste your message>

=== BUDGET ===
<max per creator, amount + currency, e.g. 20k INR>

Do this end to end:
0. POST /api/run/start {"kind":"campaign"}. On 423/409 stop and tell me why.
1. Save the client (POST /api/clients, name from the brand):
   - dmTemplate = my MESSAGE, **word for word**. If it greets a person by name (e.g. "Hi Sara,"), replace only that name with {{name}}. If there is
     no name in it, save it unchanged. Change nothing else: no rewording, no fixing, no added lines.
   - maxRate = my BUDGET as text with currency, e.g. "20k INR". If I gave none, leave it unset and tell me Claude then can't quote any price.
   - offer = what the creators will be doing and getting, built ONLY from my REQUIREMENT. Don't invent deliverables, payment terms or dates.
   - niches / related / locations / follower range from my REQUIREMENT, following "Requirement intake". List your assumptions.
2. Search. Hunt rule: if fewer than 15 creators score above 80 (`shortfall` > 0), hunt that many new ones (max 20 real creators, public info
   only, nothing invented), push them, and search once more. Report how many were above 80 before and after.
3. For every result that has an IG handle and hasn't been contacted: POST /api/outreach {creatorId, clientId, useTemplate:true, name:"<greeting name>"}.
   Greeting name = their first name if it's clearly a person's name; otherwise the account/brand name as it appears. Never write a message
   yourself, the server fills my template. If it returns an error, tell me; don't work around it.
4. Send now: GET /api/outreach/next?limit=15 and send each DM in Chrome (60-180 s apart), POST /api/outreach/:id/sent after each.
   If Instagram shows a challenge or block: POST /api/pause and stop.
5. POST /api/run/end. Report: assumptions, the saved template exactly as stored, how many found / hunted / queued / sent / held back,
   and anything that failed.

Replies and negotiation are NOT done in this run. They run on the schedule (prompts/replies.md), within the budget above.
