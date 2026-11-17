Read CLAUDE.md, sections "Requirement intake", "Hunting new creators" and "Scheduled runs". App: http://localhost:3000, API key = API_KEY in .env.local.
This run does NOT touch Instagram DMs; it only finds and queues.

1. POST /api/run/start {"kind":"hunt"}. If it returns 423 (paused) or 409 (another run active), stop immediately.
2. GET /api/clients. For each client, run the intake search (POST /api/search with clientId). If shortfall > 0 (fewer than 15 creators score above 80), hunt up to min(shortfall, 20)
   real creators (public info only, never invent anything), push them, and search once more.
3. For results with an IG handle that have never been contacted (alreadyContacted:false, status New), queue it with POST /api/outreach {creatorId, clientId, useTemplate:true, name}
   if the client has a dmTemplate (the server fills it; never rewrite it). Only if there is no template, write a personalised DM from the client's offer brief. Queue at most 45 new DMs in total this run.
4. Always finish with POST /api/run/end {"runId":"<id>","ok":true|false,"note":"<n> hunted, <n> queued"}.
