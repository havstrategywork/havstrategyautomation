"use client";
// "New post" drawer of the planner: channel, caption, images or videos (uploaded here or pasted as public links; several on a feed post make a carousel),
// a reel's cover, and when it goes out. Times are India time.
// It slides in from the right; NewPostButton (header button, or the + on a calendar day with that date) opens it through a window event, so the
// server-rendered calendar needs no client state. A plain fixed panel, not a modal <dialog>: MUI's pickers portal to <body> and a modal would make them inert.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { kindOf, MAX_MEDIA, type Media } from "@/lib/buffer";
import { createPost, type Result } from "@/app/(main)/social/planner/actions";
import { DateField } from "@/components/mui/DateField";
import { Avatar, Icon } from "@/components/ui";
import ReelCover from "@/components/ReelCover";
import { UploadButton } from "@/lib/uploadthing";

export type ComposerChannel = { channelId: string; name: string; service: string };
const IG_LIMIT = 2196, OPEN = "planner:new";

/** Opens the composer, optionally on a given day (YYYY-MM-DD). Without children it is the small + of a calendar day. */
export function NewPostButton({ date, children }: { date?: string; children?: React.ReactNode }) {
  const open = () => window.dispatchEvent(new CustomEvent(OPEN, { detail: date }));
  return children
    ? <button type="button" onClick={open}>{children}</button>
    : <button type="button" className="cal-add" onClick={open} title="New post on this day" aria-label={`New post on ${date}`}><Icon name="plus" size={14} /></button>;
}

export function Toast({ msg }: { msg: Result | null }) {
  return msg ? <div className={`toast ${msg.ok ? "ok" : "bad"}`} role="status"><Icon name={msg.ok ? "check" : "alert"} size={16} />{msg.message}</div> : null;
}

export default function PlannerComposer({ channels }: { channels: ComposerChannel[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [date, setDate] = useState<string>();
  const [channel, setChannel] = useState(channels[0]?.channelId ?? ""), [mode, setMode] = useState("schedule"), [format, setFormat] = useState("post"), [text, setText] = useState("");
  const [media, setMedia] = useState<Media[]>([]), [link, setLink] = useState(""), [coverMs, setCoverMs] = useState<number>(), [coverUrl, setCoverUrl] = useState(""), [notify, setNotify] = useState(false);
  const [err, setErr] = useState(""), [toast, setToast] = useState<Result | null>(null), [busy, start] = useTransition();
  const svc = channels.find((c) => c.channelId === channel)?.service, ig = svc === "instagram";
  const many = !ig || format === "post", reel = ig && format === "reel"; // reels and stories hold one file
  const video = media.find((m) => kindOf(m.url, m.kind) === "video");

  /** Adds media: on a feed post it joins the list, otherwise it takes the place of what was there. */
  const add = (items: Media[]) => {
    setErr("");
    if (many && media.length + items.length > MAX_MEDIA) setErr(`A post can have at most ${MAX_MEDIA} images or videos.`);
    setMedia((m) => (many ? [...m, ...items].slice(0, MAX_MEDIA) : items.slice(0, 1)));
    if (!many) setCoverMs(undefined);
  };
  const addLink = () => { const url = link.trim(); if (!url) return; if (!/^https:\/\/\S+$/.test(url)) return setErr("A media link must be a public https address."); add([{ url }]); setLink(""); };
  const drop = (i: number) => { if (media[i] === video) setCoverMs(undefined); setMedia((m) => m.filter((_, j) => j !== i)); };
  const shift = (i: number, by: number) => setMedia((m) => { const next = [...m]; [next[i], next[i + by]] = [next[i + by], next[i]]; return next; });

  useEffect(() => {
    const h = (e: Event) => { setDate((e as CustomEvent<string | undefined>).detail); setErr(""); setOpen(true); };
    window.addEventListener(OPEN, h);
    return () => window.removeEventListener(OPEN, h);
  }, []);
  useEffect(() => {
    if (!open) return;
    // Escape closes the drawer, unless it is closing one of MUI's popups (date picker) that is open on top of it
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".MuiPopper-root, .MuiPopover-root")) setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const submit = (f: FormData) => start(async () => {
    const r = await createPost(f);
    if (!r.ok) return setErr(r.message);
    setText(""); setMedia([]); setLink(""); setCoverMs(undefined); setCoverUrl(""); setNotify(false); setOpen(false); setToast(r); router.refresh();
  });

  return (
    <>
      {open && <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`drawer${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="np-title" inert={!open}>
        <form className="drawer-form" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
          <header className="drawer-head">
            <div><div className="eyebrow">Planner</div><h2 id="np-title">New post</h2></div>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" /></button>
          </header>

          <div className="drawer-body">
            <section className="fsec">
              <h3><span>1</span>Channel</h3>
              <div className="pick-grid" role="radiogroup" aria-label="Channel">
                {channels.map((c) => (
                  <label key={c.channelId} className="pick">
                    <input type="radio" name="channel" value={c.channelId} checked={channel === c.channelId} onChange={() => setChannel(c.channelId)} className="sr-only" />
                    <Avatar name={c.name} /><span className="two"><b>{c.name}</b><small>{c.service}</small></span>
                  </label>
                ))}
              </div>
              {ig && (
                <div className="seg full" role="radiogroup" aria-label="Instagram format">
                  {(["post", "reel", "story"] as const).map((t) => <label key={t}><input type="radio" name="igType" value={t} checked={format === t} onChange={() => setFormat(t)} className="sr-only" />{t[0].toUpperCase() + t.slice(1)}</label>)}
                </div>
              )}
            </section>

            <section className="fsec">
              <h3><span>2</span>Content</h3>
              <label className="lbl"><span className="row spread">Caption <small className={ig && text.length > IG_LIMIT ? "over" : "muted"}>{text.length}{ig ? ` / ${IG_LIMIT}` : ""}</small></span>
                <textarea name="text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the caption…" />
              </label>
              <div className="lbl">
                <span>{many ? "Images or videos" : reel ? "Video" : "Image or video"} {ig ? <small className="muted">required for Instagram</small> : <small className="muted">optional</small>}</span>
                {media.length > 0 && (
                  <ul className="media-list">
                    {media.map((m, i) => {
                      const isVideo = kindOf(m.url, m.kind) === "video";
                      return (
                        <li key={`${i}-${m.url}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {isVideo ? <video src={m.url} muted preload="metadata" /> : <img src={m.url} alt="" />}
                          <span className="two"><b>{media.length > 1 ? `${i + 1}. ` : ""}{isVideo ? "Video" : "Image"} added</b><small title={m.url}>{m.url}</small></span>
                          {i > 0 && <button type="button" className="icon-link" onClick={() => shift(i, -1)} title="Move earlier" aria-label={`Move item ${i + 1} earlier`}>↑</button>}
                          {i < media.length - 1 && <button type="button" className="icon-link" onClick={() => shift(i, 1)} title="Move later" aria-label={`Move item ${i + 1} later`}>↓</button>}
                          <button type="button" className="icon-link danger" onClick={() => drop(i)} title="Remove" aria-label={`Remove item ${i + 1}`}><Icon name="x" size={14} /></button>
                          <input type="hidden" name="media" value={m.url} /><input type="hidden" name="mediaKind" value={m.kind ?? ""} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {many && media.length > 1 && <p className="small muted" style={{ margin: 0 }}>{media.length} items, posted together as one carousel in this order.</p>}
                <div className="media-box">
                  <Icon name="image" size={22} />
                  <UploadButton endpoint={many ? "socialCarousel" : "socialMedia"} onClientUploadComplete={(r) => add(r.map((x) => ({ url: x.ufsUrl, kind: x.type.startsWith("video/") ? "video" as const : "image" as const })))} onUploadError={(e) => setErr(e.message)} />
                  <span className="small muted">{many ? `Choose one or several files (up to ${MAX_MEDIA}), or paste a public https link` : media.length ? "Uploading again replaces the file" : "or paste a public https link"}</span>
                </div>
                <div className="row media-link">
                  <input value={link} onChange={(e) => setLink(e.target.value)} onBlur={addLink} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} placeholder="https://…" aria-label="Media link" />
                  <button type="button" className="ghost small-btn" onClick={addLink}>Add link</button>
                </div>
              </div>
              {reel && <ReelCover video={video?.url} coverMs={coverMs} onCoverMs={setCoverMs} image={coverUrl} onImage={(url) => { setCoverUrl(url); if (url) setNotify(true); }} onError={setErr} reminder={notify} />}
            </section>

            <section className="fsec">
              <h3><span>3</span>When</h3>
              <div className="seg full" role="radiogroup" aria-label="When">
                {[["schedule", "Pick a time"], ["queue", "Next free slot"], ["draft", "Save as draft"]].map(([v, l]) => <label key={v}><input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" />{l}</label>)}
              </div>
              {mode === "queue" ? <p className="small muted" style={{ margin: 0 }}>Buffer puts it in the next open slot of this channel&apos;s posting schedule.</p> : (
                <div className="f2" style={{ alignItems: "end" }}>
                  <DateField key={date ?? "none"} name="date" label={mode === "draft" ? "Date (optional)" : "Date"} defaultValue={date} />
                  <label className="lbl"><span>Time (India)</span><input type="time" name="time" defaultValue="10:00" /></label>
                </div>
              )}
              <label className="check"><input type="checkbox" name="notify" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span className="small">Send a reminder to the Buffer app instead of posting automatically <span className="muted">(needed for personal Instagram profiles)</span></span></label>
            </section>
          </div>

          <footer className="drawer-foot">
            {err && <div className="form-err" role="alert"><Icon name="alert" size={15} />{err}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button disabled={busy || !channels.length}>{busy ? "Saving…" : mode === "draft" ? "Save draft" : mode === "queue" ? "Add to queue" : "Schedule post"}</button>
            </div>
          </footer>
        </form>
      </aside>
      <Toast msg={toast} />
    </>
  );
}
