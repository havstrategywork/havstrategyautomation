"use client";
// "New post" drawer of the planner: channel, caption, one image or video (uploaded here or pasted as a public link), and when it goes out. Times are India time.
// It slides in from the right; NewPostButton (header button, or the + on a calendar day with that date) opens it through a window event, so the
// server-rendered calendar needs no client state. A plain fixed panel, not a modal <dialog>: MUI's pickers portal to <body> and a modal would make them inert.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { kindOf } from "@/lib/buffer";
import { createPost, type Result } from "@/app/(main)/social/planner/actions";
import { DateField } from "@/components/mui/DateField";
import { Avatar, Icon } from "@/components/ui";
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
  const [channel, setChannel] = useState(channels[0]?.channelId ?? ""), [mode, setMode] = useState("schedule"), [media, setMedia] = useState(""), [kind, setKind] = useState<"image" | "video" | undefined>(), [text, setText] = useState("");
  const [err, setErr] = useState(""), [toast, setToast] = useState<Result | null>(null), [busy, start] = useTransition();
  const svc = channels.find((c) => c.channelId === channel)?.service, ig = svc === "instagram", video = kindOf(media, kind) === "video";
  const hasMedia = /^https:\/\//.test(media.trim());

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
    setText(""); setMedia(""); setKind(undefined); setOpen(false); setToast(r); router.refresh();
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
                  {(["post", "reel", "story"] as const).map((t, i) => <label key={t}><input type="radio" name="igType" value={t} defaultChecked={i === 0} className="sr-only" />{t[0].toUpperCase() + t.slice(1)}</label>)}
                </div>
              )}
            </section>

            <section className="fsec">
              <h3><span>2</span>Content</h3>
              <label className="lbl"><span className="row spread">Caption <small className={ig && text.length > IG_LIMIT ? "over" : "muted"}>{text.length}{ig ? ` / ${IG_LIMIT}` : ""}</small></span>
                <textarea name="text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the caption…" />
              </label>
              <div className="lbl"><span>Image or video {ig ? <small className="muted">required for Instagram</small> : <small className="muted">optional</small>}</span>
                <div className={`media-box${hasMedia ? " received" : ""}`}>
                  <Icon name={hasMedia ? "check" : "image"} size={22} />
                  {hasMedia && (
                    <span className="small">
                      <b>{video ? "Video received" : "Image received"}</b> — if you want to change it, click below to upload again.
                    </span>
                  )}
                  <UploadButton endpoint="socialMedia" onClientUploadComplete={(r) => { setErr(""); if (r[0]) { setMedia(r[0].ufsUrl); setKind(r[0].type.startsWith("video/") ? "video" : "image"); } }} onUploadError={(e) => setErr(e.message)} />
                  {hasMedia ? (
                    <button type="button" className="ghost small-btn" onClick={() => { setMedia(""); setKind(undefined); }}><Icon name="x" size={14} /> Remove</button>
                  ) : (
                    <span className="small muted">or paste a public https link</span>
                  )}
                </div>
                <input name="media" value={media} onChange={(e) => { setMedia(e.target.value); setKind(undefined); }} placeholder="https://…" aria-label="Media link" />
                <input type="hidden" name="mediaKind" value={kind ?? ""} />
              </div>
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
              <label className="check"><input type="checkbox" name="notify" /><span className="small">Send a reminder to the Buffer app instead of posting automatically <span className="muted">(needed for personal Instagram profiles)</span></span></label>
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
