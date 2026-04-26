---
name: Order approval
description: Visit orders need TL/Admin approval; pending vs approved sales are tracked separately on Dashboard/Leaderboard/Reports.
type: feature
---
- New visits with orders default to `visits.order_approval_status = 'pending'`.
- TL/Admin approve or reject from the Visit Details dialog (TeamPage). Sets `order_approved_by` + `order_approved_at`.
- Rejected orders contribute zero to sales totals.
- Dashboard: Sales Target card shows approved sales as the headline; pending appears as a sub-line "₹X pending TL approval".
- Leaderboard order counts and Top Performers count only `approved` orders.
- Reports CSV: salesperson + team summaries split into "Orders Approved" / "Orders Pending"; visits_detail adds an "Order Approval" column.
- Existing historic orders (>1h old) were backfilled to `approved` so totals weren't disrupted.
