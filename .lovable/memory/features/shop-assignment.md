---
name: Shop-based visit assignment
description: Visits are not assigned manually anymore — they auto-generate from per-team Shop list with monthly period frequency
type: feature
---
- Team Lead uploads a per-team **shops** Excel (Shop Name, Address, optional Contact Person, Phone). Existing shops match by name (case-insensitive).
- Address unchanged → only contact info refreshes. Address changed → re-geocoded via Nominatim, lat/lng updated.
- Each shop gets one active `shop_assignments` row (assigned_to + visits_per_month 1–5). Inserting a new assignment deactivates the previous one.
- **Period logic** (`src/lib/visitPeriods.ts`): "Fixed periods from month start". `n` periods per month evenly split over the calendar month. 1=full month, 2=halves, 3=thirds, 4≈weekly, 5≈6-day windows.
- Salesperson's Visits page synthesizes one card per assigned shop for the **current period** (id prefix `shop:<shopId>:<periodIndex>:<isoStart>`). On check-in submit, an actual `visits` row is INSERTED with `shop_id`, `assignment_id`, `period_index`, `period_start`, `period_end`. Subsequent renders hide the synthetic card because the existing row is found.
- Old manual "Assign Visit" UI removed from TeamPage. Migration wiped existing visit rows so the new flow starts clean.
- Underperformer view (TeamPage → Performance tab): per-salesperson completion % vs expected periods elapsed so far this month, plus drill-down list of shops with missed (past) periods. <70% flagged red.
- Files: `src/components/ShopsManager.tsx`, `src/components/PerformanceView.tsx`, `src/lib/geocode.ts`, `src/lib/visitPeriods.ts`.
