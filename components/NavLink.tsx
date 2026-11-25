"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const p = usePathname();
  const active = href === "/" || href === "/access" ? p === href : p.startsWith(href); // "/" and the Access Hub overview match exactly, or they would light up for every sub-page
  return <Link href={href} className={active ? "active" : ""}>{children}</Link>;
}
