---
name: Visit Check-in Logic
description: No accuracy gate, refreshable GPS, location_logs on every check-in. checked_in_at is set to the dialog-open time so time-with-customer counts as active visit (subtracted from idle). View on Map button opens Google Maps for target coords (salesperson must be punched in).
type: feature
---
- Verification radius: 100m around target (`GPS_THRESHOLD_METERS`).
- No accuracy gate — best fix in 15s is used.
- On submit, `checked_in_at` = the moment the salesperson opened the check-in dialog (`checkInOpenedAtRef`), and `checked_out_at` = submit time. The full window counts as an active visit interval and is subtracted from idle minutes by `computeIdleMinutes`.
- Every successful check-in writes a `location_logs` row with `source = 'visit_check_in'`.
- Each pending visit card shows a "View on Map" button (Google Maps deep link `https://www.google.com/maps/search/?api=1&query=lat,lng`) for the assignee. Salesperson must be punched in to use it; Team Lead can use without punching in. Button hides once the visit leaves `assigned` status (i.e. after submission).
- Salesperson "Edit Order" hidden once `order_approval_status = 'approved'` (see order-approval memory).
