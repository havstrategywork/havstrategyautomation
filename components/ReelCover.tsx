"use client";
// A reel's cover in the planner. Buffer only accepts a FRAME of the video as the cover (picked here with the slider). An image of your own can't be
// published automatically: it is attached to a reminder post, and the person publishing sets it by hand in Instagram.
import { useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { UploadButton } from "@/lib/uploadthing";

const at = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;

export default function ReelCover({ video, coverMs, onCoverMs, image, onImage, onError, reminder }: {
  video?: string; coverMs?: number; onCoverMs: (ms: number | undefined) => void;
  image: string; onImage: (url: string) => void; onError: (message: string) => void; reminder: boolean;
}) {
  const player = useRef<HTMLVideoElement>(null), [length, setLength] = useState<{ video: string; ms: number }>(), [broken, setBroken] = useState("");
  const ms = length && length.video === video ? length.ms : 0; // 0 until this video's length is known
  const seek = (value: number) => { onCoverMs(value); if (player.current) player.current.currentTime = value / 1000; };

  return (
    <div className="lbl reel-cover">
      <span>Cover <small className="muted">optional</small></span>
      {!video ? <p className="small muted" style={{ margin: 0 }}>Add the reel&apos;s video to pick its cover frame.</p> : (
        <>
          <video ref={player} key={video} src={video} muted playsInline preload="metadata" onError={() => setBroken(video)} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setLength({ video, ms: Math.floor(d * 1000) }); else setBroken(video); e.currentTarget.currentTime = (coverMs ?? 1) / 1000; }} />
          <input type="range" min={0} max={ms} step={100} value={coverMs ?? 0} disabled={!ms} onChange={(e) => seek(Number(e.target.value))} aria-label="Cover frame position" />
          <div className="row spread">
            <small className="muted">{coverMs !== undefined ? `Cover: the frame at ${at(coverMs)}` : ms ? "Drag the slider to choose the cover frame" : broken === video ? "This video can't be previewed here, so Instagram picks the cover." : "Loading the video…"}</small>
            {coverMs !== undefined && <button type="button" className="ghost small-btn" onClick={() => onCoverMs(undefined)}>Use default</button>}
          </div>
        </>
      )}
      <input type="hidden" name="coverMs" value={coverMs ?? ""} />

      <div className="media-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="Uploaded cover" /> : <Icon name="image" size={22} />}
        <UploadButton endpoint="socialCover" onClientUploadComplete={(r) => { if (r[0]) onImage(r[0].ufsUrl); }} onUploadError={(e) => onError(e.message)} />
        {image
          ? <button type="button" className="ghost small-btn" onClick={() => onImage("")}><Icon name="x" size={14} /> Remove cover image</button>
          : <span className="small muted">Or upload your own cover image (reminder posts only)</span>}
      </div>
      <input type="hidden" name="coverUrl" value={image} />
      {image && <p className={`small ${reminder ? "muted" : "bad-txt"}`} style={{ margin: 0 }}>{reminder
        ? "This reel will be sent as a reminder: whoever publishes it adds this image as the cover in the Instagram app. Its link is included in the reminder."
        : "Tick the reminder option below, or remove the image: Buffer can't publish your own cover automatically."}</p>}
    </div>
  );
}
