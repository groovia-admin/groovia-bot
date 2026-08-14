import { redirect } from 'next/navigation'

// Analytics was folded into the new Reports section (Sales Trend + Top
// Products + Gross Margin cover everything this page used to show, plus
// a real date range instead of a fixed 30 days) — this just catches
// anyone with the old URL bookmarked.
export default function AnalyticsRedirect() {
  redirect('/dashboard/reports')
}
