---
name: Target management
description: TL sets monthly / weekly / daily targets per team; multiple periods coexist with independent progress on Dashboard.
type: feature
---
- TeamPage "Set Target" dialog lets a Team Lead pick period: daily (today), weekly (Mon–Sun), monthly (ongoing).
- Stored in `targets` (period text + nullable `period_start` date). Unique per (user_id, period, period_start).
- Monthly rows have `period_start = NULL`. Weekly = current Monday ISO date. Daily = today's ISO date.
- Each period stays independent — setting a weekly target does NOT replace monthly.
- Dashboard renders one progress card per active period (Today / This Week / This Month) for the scoped users; achieved is approved-order revenue inside that window.
- Old single-target call sites still work because monthly is still the default.
