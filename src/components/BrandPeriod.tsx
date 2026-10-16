/** iScream Studio signature period — use instead of a typed "." on selected major headings. */
export function BrandPeriod({ className = "" }: { className?: string }) {
  return <span className={["brand-period", className].filter(Boolean).join(" ")}>.</span>;
}