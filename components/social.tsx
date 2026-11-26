// Presentational pieces shared by the social-team pages (overview, reports, planner, chat bots, organizations). Server components, no state.
// Every social page has the same three layers: SocialHead (what page, what you can do) > context bar (which client, which view) > content.
import Link from "next/link";
import { Avatar, Icon, type IconName } from "./ui";
import { pctChange } from "@/lib/buffer";

/** Page header: icon, eyebrow, title, one-line sub, primary actions on the right. `children` is the context bar under it (org switcher, view toggle). */
export function SocialHead({ icon, title, sub, actions, children }: { icon: IconName; title: string; sub?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="shead">
      <div className="shead-top">
        <div className="shead-title">
          <span className="shead-ico" aria-hidden="true"><Icon name={icon} size={20} /></span>
          <div><div className="eyebrow">Social media</div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        </div>
        {actions && <div className="row shead-actions noprint">{actions}</div>}
      </div>
      {children && <div className="sbar noprint">{children}</div>}
    </header>
  );
}

/** Organization switcher: one tab per org, the active one raised. `href` builds the link for an org id. */
export function OrgTabs({ orgs, current, href }: { orgs: { _id?: unknown; name: string }[]; current: string; href: (id: string) => string }) {
  return (
    <nav className="orgtabs" aria-label="Organization">
      <span className="orgtabs-label">Client</span>
      {orgs.map((o) => {
        const id = String(o._id);
        return <Link key={id} href={href(id)} className={id === current ? "on" : ""} aria-current={id === current ? "page" : undefined}><Avatar name={o.name} />{o.name}</Link>;
      })}
    </nav>
  );
}

/** Segmented links (e.g. Calendar | Kanban). For a segmented choice inside a form use <div className="seg"> with radio <label>s. */
export function Seg({ label, items }: { label: string; items: { href: string; text: string; icon?: IconName; on: boolean }[] }) {
  return (
    <nav className="seg" aria-label={label}>
      {items.map((i) => <Link key={i.href} href={i.href} className={i.on ? "on" : ""} aria-current={i.on ? "page" : undefined}>{i.icon && <Icon name={i.icon} size={15} />}{i.text}</Link>)}
    </nav>
  );
}

/** Empty state with an icon, a bold line and an optional hint / action. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="card empty-state">
      <span className="empty-ico" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <b>{title}</b>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

/** Change vs the previous period as a coloured chip (green up, red down). */
export function Delta({ cur, prev }: { cur: number | null | undefined; prev: number | null | undefined }) {
  const d = pctChange(cur, prev);
  if (d === null) return <span className="delta flat">no comparison</span>;
  return <span className={`delta ${d > 0.05 ? "up" : d < -0.05 ? "down" : "flat"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%</span>;
}
