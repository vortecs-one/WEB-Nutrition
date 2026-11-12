import H2HTokensBadge from "./H2HTokensBadge";
import VTokensBadge from "./VTokensBadge";

// Every token wallet shown at the top of the dashboard, v-healthy first.
export default function TokensBar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <VTokensBadge />
      <H2HTokensBadge />
    </div>
  );
}
