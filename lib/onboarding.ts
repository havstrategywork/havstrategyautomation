// The client onboarding form: ONE schema that drives the public page, the server-side validation and the Google Sheet / .xlsx columns.
// Pure (no imports), so the browser, the API route and the tests share it. Question wording comes from the agency's old Google Form
// ("Onboarding Form", 62 items); the Creator marketing, Meta Ads and SEO steps are new (the old form had no questions for them).

export const SERVICES = [
  { id: "social", label: "Social media marketing", blurb: "Content, community and growth on your social channels." },
  { id: "creator", label: "Creator marketing", blurb: "Influencers and UGC creators who put your brand in front of their audience." },
  { id: "google", label: "Google Ads", blurb: "Search and performance campaigns that capture people ready to buy." },
  { id: "meta", label: "Meta Ads", blurb: "Facebook and Instagram campaigns built around your audience." },
  { id: "seo", label: "SEO", blurb: "Rank higher on Google and win organic, compounding traffic." },
] as const;
export type ServiceId = (typeof SERVICES)[number]["id"];
export const isService = (x: unknown): x is ServiceId => SERVICES.some((s) => s.id === x);

export type FieldType = "text" | "long" | "email" | "url" | "scale" | "file";
export type Field = { id: string; label: string; type: FieldType; help?: string; required?: boolean; placeholder?: string };
/** `services` = shown when ANY of these is selected; omitted = always shown. `kind: "services"` is the picker itself (no fields). */
export type Step = { id: string; title: string; intro: string; fields: Field[]; services?: ServiceId[]; kind?: "services" };

const t = (id: string, label: string, o: Partial<Field> = {}): Field => ({ id, label, type: "text", ...o });
const l = (id: string, label: string, o: Partial<Field> = {}): Field => ({ id, label, type: "long", ...o });
const f = (id: string, label: string, o: Partial<Field> = {}): Field => ({ id, label, type: "file", ...o });

export const STEPS: Step[] = [
  { id: "services", kind: "services", title: "What can we help you with?", intro: "Pick every service you are interested in. We only ask about what you choose.", fields: [] },
  {
    id: "contact", title: "Let's start with you", intro: "So we know who to talk to.",
    fields: [
      t("name", "Your name", { required: true, placeholder: "Full name" }),
      { id: "email", label: "Email", type: "email", required: true, placeholder: "you@company.com" },
      t("company", "Company or brand name", { required: true }),
      { id: "website", label: "Website", type: "url", placeholder: "yourbrand.com" },
      t("phone", "Phone or WhatsApp (optional)"),
    ],
  },
  {
    id: "business", title: "Your business", intro: "Where you are today, and what makes you different.",
    fields: [
      l("where", "Where are you in your business? What have you tried? What’s worked? What didn't?"),
      l("focus", "What are the most important aspects of your business you want us to focus on?"),
      l("competitors", "Who are your 3 main competitors (direct or indirect)? What do you like and dislike about them?"),
      l("different", "What about your background or product or service sets you apart from your competitors?"),
    ],
  },
  {
    id: "brandlook", title: "Brand guidelines", intro: "This info helps us communicate your brand.",
    fields: [
      t("colors", "Brand colors and hex codes"),
      t("fontHeading", "Font name for Heading (for creatives/email marketing/websites)"),
      t("fontBody", "Font name for Body (for creatives/email marketing/websites)"),
      f("logos", "Logo in all versions and file formats"),
      f("icons", "Icons in all versions and file formats"),
      f("manual", "Please share the branding manual"),
    ],
  },
  {
    id: "brandvoice", title: "Your brand story and voice", intro: "How you want people to see and feel your brand.",
    fields: [
      l("story", "Is there a unique story behind your business or business name or logo?"),
      t("vision", "What’s your brand/company vision?"),
      t("personality", "What is your brand/company personality?"),
      t("message", "What is your brand message?"),
      t("feel", "How do you want your customers/audience/followers to feel?"),
      l("update", "Does any of your current material/product or anything need to be updated?"),
      l("dont", "Please tell us what we shouldn't do while communicating your brand/company."),
    ],
  },
  {
    id: "customers", title: "About your customers", intro: "These questions help us understand your customers.",
    fields: [
      l("ideal", "Who are your ideal customers?"),
      t("geo", "Where are the majority of your customers based geographically?"),
      t("primaryMessage", "What is the primary message you want to convey to your customers?"),
      l("pain", "What problem/pain points do your customers have? How do you solve them?"),
      l("trust", "Why should your customers buy from you or trust you?"),
    ],
  },
  {
    id: "custdata", title: "Research and customer data", intro: "Anything that helps us start from facts, not guesses.",
    fields: [
      l("research", "Do you have any market research about your ideal customers or your product/business that you can share with us?"),
      f("customerList", "Current customers list", { help: "Please provide your current customer list with customer name, email, and phone number. If you can provide city, state and zip code then please do that. The customer list is used to create lookalike audiences in Facebook and for email marketing." }),
      l("customersElse", "Anything else we should know (related to your customers/brand/business)?"),
      f("anyFile", "Anything else you want to share (any document or any file)"),
    ],
  },
  {
    id: "socialgoals", services: ["social"], title: "Social media: goals", intro: "What social media should do for your business.",
    fields: [
      l("smPurpose", "What is your purpose on social media?"),
      l("smFunnel", "How does social media fit into your growth plan/sales funnel/buyer journey?"),
      l("smAchieve", "What do you hope to achieve using social media? How will you know you’ve achieved it?"),
      l("smMetrics", "Which metrics would you like us to track? (e.g., engagement, awareness, ROI, organic sales)"),
      l("smBarrier", "What’s the biggest barrier to your success on social media?"),
    ],
  },
  {
    id: "socialaudience", services: ["social"], title: "Social media: your audience", intro: "Who we are talking to, and where they spend time.",
    fields: [
      l("smAudience", "Describe your target audience. Who are they?"),
      l("smPlatforms", "What social platforms do they use?"),
      l("smEngage", "Who else (brands/celebrities/people) does your audience engage with?"),
      l("smResponds", "What type of content does your audience respond to best (if known)?"),
      l("smPersonal", "What personal details do you want your audience to know about you (dogs, kids, hobbies, etc.)?"),
    ],
  },
  {
    id: "socialcontent", services: ["social"], title: "Social media: content and workflow", intro: "How content gets made, and how it should look.",
    fields: [
      l("smProcess", "Describe your current process/workflow for creating a piece of content, from ideation to publication."),
      l("smResources", "What resources do you have available for content creation?"),
      l("smTypes", "What type(s) of content do you want to create for your audience (videos, images, testimonials, blog posts, infographics, illustrations etc)? Do you want to test something new?"),
      l("smContentMessage", "What message are you trying to send with your content?"),
      l("smCta", "What call to action (CTA) do you typically want readers/followers to take after reading your content?"),
      l("smSchedule", "Do you have a specific posting schedule, or would you like us to mix the hours from time to time?"),
      l("smTools", "What tools have you used to manage your social media profiles till now?"),
      t("smManager", "Is there anyone managing your social media platforms at the moment?"),
    ],
  },
  {
    id: "creator", services: ["creator"], title: "Creator marketing", intro: "Tell us what kind of creators and campaigns you have in mind.",
    fields: [
      l("crGoal", "What do you want creator marketing to achieve? (awareness, sales, content for your own channels, app installs...)"),
      l("crFit", "What kind of creators fit your brand? (niche, follower size, tone, location, language)"),
      l("crPast", "Have you worked with creators before? What worked and what didn't?"),
      l("crDeliverables", "What do you expect creators to deliver? (reels, stories, posts, UGC videos, usage rights, exclusivity)"),
      t("crBudget", "What is your budget per creator, or for the whole campaign?"),
      l("crOffer", "What can creators receive? (free product, paid fee, affiliate commission)"),
    ],
  },
  {
    id: "google", services: ["google"], title: "Google Ads", intro: "What you want to show up for, and where.",
    fields: [
      t("gObjective", "What is the objective for the Google Ads campaign?"),
      l("gKeywords", "What keywords do you want Google Ads to display for?"),
      l("gNegative", "Are there any negative keywords for Google Ads?"),
      l("gLocation", "Any specific location we can target for ad campaigns?"),
      l("gAccount", "Do you already have a Google Ads account and conversion tracking set up? Tell us what exists."),
    ],
  },
  {
    id: "meta", services: ["meta"], title: "Meta Ads", intro: "Facebook and Instagram advertising.",
    fields: [
      t("mObjective", "What is the objective for your Meta Ads campaigns? (sales, leads, messages, traffic, awareness)"),
      l("mAudience", "Who should we show your ads to? (age, interests, location, existing customers)"),
      l("mAccount", "Do you have a Meta Business Manager, Facebook page, Instagram account and Pixel set up? Tell us what exists."),
      l("mCreative", "What creatives and offers can we run? (videos, images, discounts, launches)"),
    ],
  },
  {
    id: "seo", services: ["seo"], title: "SEO", intro: "Your website and what you want to rank for.",
    fields: [
      { id: "sWebsite", label: "Which website should we work on?", type: "url", placeholder: "yourbrand.com" },
      l("sKeywords", "Which keywords, topics or pages do you most want to rank for?"),
      l("sLocation", "Which locations and languages do you want to rank in?"),
      l("sPast", "Any past SEO work, penalties, redesigns or migrations we should know about?"),
      l("sAccess", "Do you have Google Search Console, Google Analytics or any SEO tool we can get access to?"),
      l("sBlog", "Do you publish a blog or other content? How often?"),
    ],
  },
  {
    id: "budget", services: ["creator", "google", "meta"], title: "Budget and value", intro: "So we can plan spend sensibly.",
    fields: [
      l("budget", "What is your monthly budget? (For social media ads & google ads)"),
      t("ltv", "How much is a single customer worth to you? What is the LTV (LifeTime Value) of a single customer?"),
      l("assets", "Please share additional business assets such as marketing materials, product images, videos etc so that we have everything needed to effectively advertise your business. To do this, you can share a Google Drive link here. Copy-paste it!"),
    ],
  },
  {
    id: "working", title: "Working together", intro: "How you like to work and give feedback.",
    fields: [
      l("input", "How much input do you want to have into campaigns?"),
      l("approval", "What is the approval process?"),
      l("commsView", "What do you think about communication in an agency and client relationship?"),
      { id: "commsScale", label: "On a scale of one to 10, how important is communication?", type: "scale" },
      l("honest", "Do you think sending honest feedback can improve the relationship or outcome?"),
      l("criticism", "What do you think about constructive criticism?"),
    ],
  },
];

/** Steps that apply to this selection, in order. With nothing selected only the picker and the always-on steps show. */
export const visibleSteps = (services: readonly ServiceId[]) => STEPS.filter((s) => !s.services || s.services.some((x) => services.includes(x)));
export const allFields = () => STEPS.flatMap((s) => s.fields);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILE_LINE = /(https:\/\/[^\s]+)$/;
const FILE_HOST = /^https:\/\/([a-z0-9-]+\.)*(ufs\.sh|utfs\.io|uploadthing\.com)\//i; // files only ever come from our UploadThing account
export const MAX_TEXT = 5000;

/** Problems with one step's answers (used by the page before "Continue" and by the server for every visible step). */
export function stepErrors(step: Step, a: Record<string, string>): Record<string, string> {
  const err: Record<string, string> = {};
  for (const fd of step.fields) {
    const v = (a[fd.id] ?? "").trim();
    if (fd.required && !v) err[fd.id] = "This one is required.";
    else if (v && fd.type === "email" && !EMAIL.test(v)) err[fd.id] = "Enter a valid email address.";
    else if (v && fd.type === "url" && !/^(https?:\/\/)?[^\s/]+\.[^\s/]+\S*$/i.test(v)) err[fd.id] = "Enter a website address, like yourbrand.com";
    else if (v && fd.type === "scale" && !/^(10|[1-9])$/.test(v)) err[fd.id] = "Pick a number from 1 to 10.";
    else if (v && fd.type === "file" && !v.split("\n").every((x) => FILE_LINE.test(x.trim()) && FILE_HOST.test(x.trim().match(FILE_LINE)![1]))) err[fd.id] = "Upload files with the uploader.";
    else if (v.length > MAX_TEXT) err[fd.id] = `Keep it under ${MAX_TEXT} characters.`;
  }
  return err;
}

/** Server-side check of a whole submission. Anything not asked for the chosen services is dropped, never stored. */
export function validate(body: unknown): { ok: true; services: ServiceId[]; answers: Record<string, string> } | { ok: false; error: string } {
  const b = (body ?? {}) as { services?: unknown; answers?: unknown };
  const services = [...new Set(Array.isArray(b.services) ? b.services.filter(isService) : [])];
  if (!services.length) return { ok: false, error: "Pick at least one service." };
  const raw = b.answers && typeof b.answers === "object" ? (b.answers as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  for (const step of visibleSteps(services)) {
    for (const fd of step.fields) answers[fd.id] = typeof raw[fd.id] === "string" ? (raw[fd.id] as string).trim() : "";
    const err = stepErrors(step, answers);
    const first = Object.entries(err)[0];
    if (first) return { ok: false, error: `${step.title}: "${step.fields.find((x) => x.id === first[0])!.label.slice(0, 70)}" - ${first[1]}` };
  }
  for (const fd of allFields()) if (fd.type === "url" && answers[fd.id] && !/^https?:\/\//i.test(answers[fd.id])) answers[fd.id] = `https://${answers[fd.id]}`; // "mysite.com" is stored as a link
  return { ok: true, services, answers };
}

/** The spreadsheet id inside a pasted Google Sheets link (or a bare id). Anything else (a Form, a Doc, an .xlsx link) gives null. */
export function sheetIdFromUrl(input: string): string | null {
  const v = input.trim();
  const m = v.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/i);
  return m ? m[1] : /^[\w-]{30,}$/.test(v) ? v : null;
}

/** Sheet / Excel layout: Submitted, Services, then every question in form order (blank when it wasn't asked). */
export const HEADER = ["Submitted", "Services", ...allFields().map((x) => x.label.slice(0, 150))];
export const toRow = (at: Date, services: readonly ServiceId[], answers: Record<string, string>) =>
  [at.toISOString().slice(0, 16).replace("T", " "), services.map((s) => SERVICES.find((x) => x.id === s)!.label).join(", "), ...allFields().map((x) => answers[x.id] ?? "")];
