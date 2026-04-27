---
name: Tracking page performance
description: Query scoping, realtime filters, debounced invalidations, and slim payloads for the /tracking dashboard at 100+ concurrent users.
type: feature
---
Optimizations on `src/pages/TrackingPage.tsx` for ~120 daily field users:

- **Scoped queries**: `location_logs` and `attendance_punches` SELECTs use `.in('user_id', visibleUserIds)`. Team Leads only pull their team's rows; admins still pull all (RLS allows).
- **Stable cache key**: `visibleIdsKey` is the sorted, comma-joined user-id list — used in `useQuery` keys so React Query reuses cached data when the membership list is unchanged.
- **Slim payload**: list-view SELECT excludes `accuracy`, `created_at`, `visit_id`, `id` — only fields needed for the row card.
- **Realtime filter**: Team Leads subscribe with `user_id=in.(...)` postgres filter (skipped for admins or membership > 100 to avoid Realtime payload limits). One channel per user (`tracking-live-${user.id}`).
- **Debounced invalidations**: 5-second debounce per table on realtime callbacks — bursts of pings only trigger one refetch.
- **Safety-net polling**: increased from 30s → 60s now that realtime is reliable.
- Detail page (`/tracking/:userId`) already scopes to a single user — no changes needed.

Not yet added (future): partial indexes on `(user_id, logged_at desc)` and `visits(order_approval_status)` for hot lookups; consider when row counts grow past ~1M.
