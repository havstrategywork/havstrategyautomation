// Small presentational pieces shared by the social-team pages (overview, reports, chat bots). Server components, no state.
import Link from "next/link";
import { Avatar } from "./ui";
import { pctChange } from "@/lib/igreport";

/** Organization switcher: one pill per org, the active one filled. `href` builds the link for an org id. */
export function OrgTabs({ orgs, current, href }: { orgs: { _id?: unknown; name: string }[]; current: string; href: (id: string) => string }) {
  return (
    <nav className="orgtabs noprint" aria-label="Organization">
      {orgs.map((o) => {
        const id = String(o._id);
        return <Link key={id} href={href(id)} className={id === current ? "on" : ""} aria-current={id === current ? "page" : undefined}><Avatar name={o.name} />{o.name}</Link>;
      })}
    </nav>
  );
}

/** Change vs the previous period as a coloured chip (green up, red down). */
export function Delta({ cur, prev }: { cur: number | null | undefined; prev: number | null | undefined }) {
  const d = pctChange(cur, prev);
  if (d === null) return <span className="delta flat">no comparison</span>;
  return <span className={`delta ${d > 0.05 ? "up" : d < -0.05 ? "down" : "flat"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%</span>;
}
