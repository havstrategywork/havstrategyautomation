// Seeds demo data through the running app's API: `npm run seed` (dev server must be up).
// All handles/emails are fake (example.com). Safe to re-run: creators upsert, clients skip if name exists.
const base = process.env.BASE_URL ?? "http://localhost:3000";
const key = process.env.API_KEY ?? "change-me";
const call = (path, body) => fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }).then((r) => r.json());

const clients = [
  { name: "FitFuel (protein snacks)", niches: ["fitness", "nutrition"], minFollowers: 20000, maxFollowers: 150000, notes: "Wants authentic gym/lifestyle creators, India-based." },
  { name: "GlowLab (skincare)", niches: ["beauty", "skincare"], minFollowers: 10000, maxFollowers: 80000, weights: { engagement: 4 }, notes: "Engagement matters more than reach." },
];
const creators = [
  { name: "Ria Sharma", igHandle: "demo_ria_fit", email: "ria@example.com", igCategory: "Fitness Coach", location: "Dubai, UAE", phone: "+971500000001", contactSource: "IG bio", status: "Negotiating", quotedRate: "2500 AED", niches: ["fitness", "nutrition"], followers: 62000, engagementRate: 4.8, collab: { count: 3, rating: 4.5, notes: "Delivered 3 reels on time, great comments." }, notes: "Home-workout reels, vegetarian meal prep." },
  { name: "Kabir Anand", igHandle: "demo_kabir_lifts", niches: ["fitness"], followers: 140000, engagementRate: 2.1, collab: { count: 1, rating: 2.5, notes: "Late on deliverables." }, notes: "Powerlifting; strong reach, weak engagement." },
  { name: "Meera Iyer", igHandle: "demo_meera_glow", email: "meera@example.com", igCategory: "Beauty & Personal Care", location: "Abu Dhabi, UAE", contactSource: "Linktree", status: "Agreed", quotedRate: "1800 AED", agreedRate: "1500 AED", niches: ["beauty", "skincare"], followers: 35000, engagementRate: 6.4, collab: { count: 2, rating: 5, notes: "Very professional, repeat partner." }, notes: "Dermatologist-adjacent skincare explainers." },
  { name: "Dev Malhotra", igHandle: "demo_dev_eats", email: "dev@example.com", igCategory: "Food Blogger", location: "Sharjah, UAE", contactSource: "website", niches: ["food", "nutrition"], followers: 48000, engagementRate: 3.9, collab: { count: 0, rating: 0, notes: "" }, notes: "Healthy street-food reviews." },
  { name: "Tara Nair", igHandle: "demo_tara_style", niches: ["fashion", "beauty"], followers: 9000, engagementRate: 7.2, collab: { count: 0, rating: 0, notes: "" }, notes: "Micro-influencer, thrift fashion." },
  { name: "Arjun Rao", igHandle: "demo_arjun_run", email: "arjun@example.com", niches: ["fitness", "running"], followers: 27000, engagementRate: 5.5, collab: { count: 1, rating: 4, notes: "Good story coverage." }, notes: "Marathon training diaries." },
  { name: "Sana Qureshi", igHandle: "demo_sana_skin", niches: ["skincare"], followers: 72000, engagementRate: 3.0, collab: { count: 0, rating: 0, notes: "" }, notes: "Budget skincare routines." },
  { name: "Nikhil Bose", igHandle: "demo_nik_travel", email: "nikhil@example.com", niches: ["travel"], followers: 90000, engagementRate: 2.8, collab: { count: 0, rating: 0, notes: "" }, notes: "Off-topic for both clients; checks low scores." },
].map((c) => ({ ...c, source: "demo" }));

const existing = new Set((await call("/api/clients")).map((c) => c.name));
for (const c of clients) if (!existing.has(c.name)) await call("/api/clients", c);
const res = await call("/api/creators", creators);
console.log(`clients: ${clients.length}, creators: ${res.filter((r) => r.ok).length}/${creators.length} ok`);
