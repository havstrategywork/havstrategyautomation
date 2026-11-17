Read CLAUDE.md (sections "Requirement intake" and "Hunting new creators"), then read briefs/veda-luxe.md, which is the full client brief.
App: http://localhost:3000, API key = API_KEY in .env.local.

THIS IS A SEARCH-ONLY RUN. Do NOT queue outreach, send any DM or email, post messages, or touch the reply loop. Only read, search, and add creators to the database.

1. Save the client "Veda Luxe" with POST /api/clients, built only from the brief:
   - niches: skincare, ayurveda, clean beauty, luxury beauty. related: ayurvedic skincare, self care, wellness, rituals, skin routine, natural skincare.
   - locations: mumbai, delhi, ncr, bengaluru, hyderabad.
   - follower range: the 10 ideal profiles span 7.5k-25.2k, so use roughly 5k-40k. State this as an assumption.
   - weights: engagement counts more than usual (the brief's non-negotiable is engagement authenticity): niche 3, followers 1, engagement 3, collab 1, location 2.
   - offer: from section 6 of the brief (product seeding first, then a paid reel + story bundle, affiliate code 10-15%, co-branded ritual kit) and the persona.
   - No dmTemplate (none was given). No maxRate (the brief has no budget).
2. Add the 10 ideal influencer profiles from section 2 of the brief to the database (POST /api/creators, source "client-brief", handle + followers + a note
   "ideal profile from client brief"; leave everything you can't see blank). They are reference creators and should appear in the search.
3. POST /api/search with the client. Hunt rule: if fewer than 15 creators score above 80 (the response's `shortfall` > 0), hunt that many NEW creators
   (max 20): real Instagram creators matching the persona and the ideal profiles' look (micro creators, ingredient/ritual/routine content, metro India).
   Verify from their public profile only: handle, follower count, a public email if visible, location from bio. Never invent or guess anything.
   Push them with source "claude-hunt", then search ONE more time. Do not loop.
4. For the top results only, do a quick public check against the brief's creator-side rules, and put findings in each creator's `notes`; do not drop
   anyone silently:
   - visibly promoting Kama Ayurveda, Forest Essentials, Just Herbs, Ohria Ayurveda or Sadhev in the last 30 days -> say so and flag them;
   - obviously inauthentic engagement (huge followers, almost no real comments) -> flag;
   - if you can't tell, write "not verified".
5. Report:
   - my assumptions (short list)
   - how many creators scored above 80 before the hunt and after, and how many you hunted
   - a ranked table: score, handle, followers, location, IG link, public email yes/no, flags, one-line why they fit
   - the 10 ideal profiles and where they landed in the ranking
   - anything you couldn't verify, and what's missing before outreach (e.g. no budget, no message yet)
