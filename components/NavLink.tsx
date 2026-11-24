"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const p = usePathname();
  const active = href === "/" || href === "/social" ? p === href : p.startsWith(href); // home pages match exactly, or they would light up for every page under them
  return <Link href={href} className={active ? "active" : ""}>{children}</Link>;
}
