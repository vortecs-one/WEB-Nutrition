import Image from "next/image";

interface TokenBadgeProps {
  label: string;
  hint: string;
  value: string;
  iconSrc: string;
  unavailable?: boolean;
  tone?: "primary" | "accent";
  className?: string;
}

const TONES = {
  primary: "bg-primary/15",
  accent: "bg-accent/15",
} as const;

// Presentational pill shared by every token shown at the top of the dashboard.
export default function TokenBadge({
  label,
  hint,
  value,
  iconSrc,
  unavailable = false,
  tone = "primary",
  className = "",
}: TokenBadgeProps) {
  return (
    <div
      role="status"
      aria-label={`${label}: ${value}`}
      title={hint}
      className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 ${TONES[tone]} ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
        <Image
          src={iconSrc}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={`mt-1 text-base font-semibold tabular-nums text-foreground ${unavailable ? "opacity-40" : ""}`}
        >
          {value}
        </span>
      </span>
    </div>
  );
}
