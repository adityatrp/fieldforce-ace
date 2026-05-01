# Memory: index.md
Updated: just now

# Project Memory

## Core
- **App**: FieldForce Pro (GPS check-ins, expenses, multi-level field sales).
- **Tech Stack**: Supabase (Auth, RLS, Storage), OpenStreetMap/Nominatim. NEVER use Google Maps for embedded maps. Google Maps deep-links (search?api=1&query=lat,lng) ARE OK for "open in maps" buttons.
- **Native shell**: Wrapped in Capacitor. Background location uses `@capacitor-community/background-geolocation`. Web is a fallback only.
- **Roles**: Admin, Team Lead (manages own team only), Salesperson (no admin access).
- **Design**: Native mobile app feel, sticky glassmorphism headers, bottom tab bar, navy/blue/slate-gray, SF Pro.
- **Tracking**: Salesperson must punch in for the day before any visit check-in; cannot stop tracking until punch-out. Background location pings every 5 min while punched in; also on punch in/out and visit check-in.

## Memories
- [Background Tracking](mem://features/background-tracking) — Capacitor wrapper, 5-min background pings, idle math, daily summary table
- [Role Permissions](mem://auth/role-permissions) — Strict data isolation and routing rules for Admin, Team Lead, and Salesperson roles
- [Test Accounts](mem://auth/testing-credentials) — Standard development credentials for all roles
- [Database Sync Trigger](mem://architecture/database-logic) — Profile creation on Supabase auth via on_auth_user_created trigger
- [Expense Logic](mem://features/expense-logic) — Expense claim tracking, approval identity, and status aggregations
- [Performance Analytics](mem://features/performance-analytics) — Role-scoped metrics, underperformer alerts, and leaderboard logic
- [Product Management](mem://features/product-management) — Role access rules for the Product Master catalog
- [Reporting Suite](mem://features/reporting-suite) — Admin CSV exports for metrics, team summaries, and expenses
- [Route Optimization](mem://features/route-optimization) — 'Start Your Day' greedy nearest-neighbor sorting and re-optimization
- [Target Management](mem://features/target-management) — Monthly + weekly + daily targets, multi-period support, Dashboard cards per period
- [Order Approval](mem://features/order-approval) — TL/Admin approve visit orders via Team page Approvals tab; Dashboard splits approved vs pending sales
- [Tracking Performance](mem://architecture/tracking-performance) — Scoped queries, filtered realtime, debounced invalidations on /tracking
- [Visit Assignment](mem://features/visit-assignment) — LEGACY manual assignment (removed) — superseded by Shop Assignment
- [Shop Assignment](mem://features/shop-assignment) — Lead uploads shops Excel; auto-geocoded; assigned to salesperson with monthly visit frequency; salesperson sees current period's due shops
- [Visit Check-in Logic](mem://features/visit-check-in) — No accuracy gate, refreshable GPS, location_logs on every check-in
- [Attendance & Tracking](mem://features/attendance-tracking) — Daily punch in/out, location_logs, /tracking page for Admin & Lead
- [Design Aesthetic](mem://style/aesthetic) — Enterprise SaaS native mobile feel, styling rules, and typography
