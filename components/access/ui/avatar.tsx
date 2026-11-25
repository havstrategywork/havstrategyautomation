import { cn } from "@/lib/access/utils";
import { initials } from "@/lib/access/utils";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("h-8 w-8 rounded-full object-cover border border-border", className)} />;
  }
  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary", className)}>
      {initials(name) || "?"}
    </div>
  );
}
