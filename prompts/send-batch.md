Read CLAUDE.md, sections "Sending IG DMs" and "Scheduled runs". App: http://localhost:3000, API key = API_KEY in .env.local.

1. POST /api/run/start {"kind":"send"}. If it returns 423 (paused) or 409 (another run active), stop immediately and do nothing else.
2. GET /api/outreach/next?limit=15. If items is empty, end the run (ok:true, note "nothing to send") and stop.
3. For each item: open igUrl in Chrome, click Message, type the message, send, then POST /api/outreach/:id/sent {"ok":true}.
   Wait a random 60-180 seconds between DMs. Never send anything the server didn't hand you.
   If our account has already messaged that creator (check the thread first), do not send: report {"ok":false,"error":"already contacted"}.
4. If Instagram shows a challenge, action block, "try again later", a login wall, or anything unexpected: POST /api/pause {"reason":"..."},
   mark the current item {"ok":false,"error":"..."}, end the run with ok:false, and stop. Do not retry.
5. Always finish with POST /api/run/end {"runId":"<id>","ok":true|false,"note":"<n> sent, <n> failed"}.
