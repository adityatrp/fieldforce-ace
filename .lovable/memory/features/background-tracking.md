---
name: Background tracking & idle math
description: Capacitor wrapper, 5-min background pings, 13-decimal coords, idle-time rule (3 consecutive pings within 100m), and daily summary table.
type: feature
---
- Wrapped in Capacitor (config in `capacitor.config.ts`, hot-reload server URL points to Lovable sandbox).
- Native plugin: `@capacitor-community/background-geolocation` (registered via `registerPlugin('BackgroundGeolocation')`). Web fallback uses `setInterval` (only works while tab is alive — banner shown to leads).
- `src/lib/backgroundTracker.ts` starts on punch-in, stops on punch-out, throttles writes to one ping per 5 minutes regardless of OS update frequency. Source = `background_ping`.
- Each ping stores 13-decimal coords + battery % + charging into `location_logs`.
- `src/lib/distance.ts`:
  - `computeIdleMinutes`: slides 3-ping window, marks span idle when max pairwise distance ≤ 100m, merges overlaps, then subtracts verified-visit (status `verified` or `completed`, with `checked_out_at`) intervals.
  - `totalDistanceKm`: haversine sum across pings ordered by `logged_at`.
- `attendance_daily_summary` table: one row per (user_id, work_date). Columns include `total_distance_km`, `total_idle_minutes`, `total_active_visit_minutes`, `punched_in_at`, `punched_out_at`, `ping_count`. RLS: salesperson reads/writes own; team lead reads team via `users_share_team`; admin reads all.
- Summary upsert: written on punch-out, AND live recomputed on the individual tracking page when the owner views their own day (RLS prevents leads from writing).
- Routes: `/tracking` (lead/admin list) and `/tracking/:userId` (individual). "View in Google Maps" uses `https://www.google.com/maps/search/?api=1&query=lat,lng` (deep-links to native app on mobile).
