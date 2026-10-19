/** "2026-10-19" or "2026-10-19 13:02:05" → "Oct 19, 2026" */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function isoDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}
