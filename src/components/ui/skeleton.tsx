import { cn } from "@/lib/utils";

/** Loading placeholder. Shimmer animation defined in globals.css. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-bg-tint",
        className,
      )}
      {...props}
    />
  );
}
