---
name: Order approval
description: Visit orders need TL/Admin approval; pending vs approved sales are tracked separately on Dashboard/Leaderboard/Reports. Approvals queue lives on Team page.
type: feature
---
- New visits with orders default to `visits.order_approval_status = 'pending'`.
- TL/Admin approve or reject from two surfaces:
  1. **Team page → Approvals tab** (primary queue): badge shows count of pending orders, inline Approve/Reject buttons with order total + item count. Tab auto-opens by default whenever there are pending items.
  2. Visit Details dialog (legacy) on the Visits tab — same mutation.
- Approval sets `order_approved_by` + `order_approved_at`.
- Rejected orders contribute zero to sales totals.
- Dashboard: Sales Target card shows approved sales as the headline; pending appears as a sub-line "₹X pending TL approval".
- Leaderboard order counts and Top Performers count only `approved` orders.
- Reports CSV: salesperson + team summaries split into "Orders Approved" / "Orders Pending"; visits_detail adds an "Order Approval" column.
- Existing historic orders (>1h old) were backfilled to `approved` so totals weren't disrupted.
- Approvals queue uses a single `pending-order-totals` query that aggregates `visit_order_items` client-side — invalidated by the approval mutation.
