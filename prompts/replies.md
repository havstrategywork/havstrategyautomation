Read CLAUDE.md, sections "Conversations" and "Scheduled runs". App: http://localhost:3000, API key = API_KEY in .env.local.

1. POST /api/run/start {"kind":"replies"}. If it returns 423 (paused) or 409 (another run active), stop immediately and do nothing else.
2. Run one pass of the reply loop exactly as described under "Conversations": watch list -> sync each thread (the creator's messages AND any
   reply a human typed by hand, oldest first, as direction "in" / "out" with by:"human") -> pending threads -> reply or escalate -> send queued
   replies in Chrome -> mark sent. Only open threads on the watch list; ignore every other thread.
   If a human has already answered a thread, skip it entirely until the creator writes again.
3. If Instagram shows a challenge, action block, "try again later", a login wall, or anything unexpected: POST /api/pause {"reason":"..."},
   end the run with ok:false, and stop. Do not retry.
4. Always finish with POST /api/run/end {"runId":"<id>","ok":true|false,"note":"<n> logged, <n> sent, <n> escalated"}.
