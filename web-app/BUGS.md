# M1 Smoke Test — Bug Log (Aug 19)

## Summary
## Summary
- P1 (blocker): 1 found, 1 fixed
- P2 (broken UX): 4 found, 3 fixed, 1 open (PM ticket tenant display)
- P3 (cosmetic): 2 found, 1 fixed, 1 open (avatar mismatch)

## Bugs

### [P?] Title
**Steps to reproduce:**
1.
2.

**Expected:**

**Actual:**

**Browser:** Chrome Desktop / Safari Mobile (375px)


### [P2] Company Admin dashboard "Role Breakdown" missing Property Manager entirely
**Steps to reproduce:**
1. Log in as Company Admin
2. View Dashboard (not User Management page)
3. Look at stat cards and "Role Breakdown" section

**Expected:** Should show counts for all roles Company Admin manages —
Regional Manager, Property Manager, Owner, Tenant.

**Actual:** Only shows Regional Managers (1), Tenants (3), Owners (1).
Property Manager is missing entirely, even though 3 exist (pm1, pm2, testpm).

**Likely cause:** AdminDashboard.js's STAT_CARDS/visibleCards filtering logic
(found during earlier grep) filters Company Admin's view to only
Regional Manager/Owner/Tenant — same class of bug as the invite dropdown
issue, just not yet fixed on this page.

**Severity:** P2 — dashboard undercounts real data, misleading for a
stakeholder demo.


### [P1] PM sees "0 properties" despite valid PropertyAssignment
**Steps to reproduce:**
1. Seed data assigns pm1 to Oak Residences via PropertyAssignment
   (not by pm1 personally creating the property)
2. Log in as pm1
3. View Properties page

**Expected:** PM1 sees Oak Residences (per PropertyAssignment).

**Actual:** "No properties yet" / "0 properties you manage."

**Root cause (confirmed via code review):** PropertyManagement.js's
fetchProperties() calls GET /properties, which filters PMs by
`Property.created_by == user.username` — i.e. only properties the PM
personally created via the "Add Property" button. It ignores
PropertyAssignment entirely. A separate, correct endpoint already exists —
GET /pm/properties — which properly filters via
_pm_assigned_property_ids(), but it's currently only used by the ticket
filter, not the main Properties page.

**Impact:** Any PM assigned to a property by an admin (rather than
self-creating it) sees zero properties — blocks the entire PM workflow
(view units, create leases, upload photos). This is exactly the seed data
setup and blocks Test Script 2 entirely.

**Severity:** P1 — blocker. Core PM functionality is unusable for the
demo's actual seeded scenario.

**Fix (not applied yet, per Day 21 "log only" rule):** Change
PropertyManagement.js's fetchProperties() to call `${API}/pm/properties`
instead of `${API}/properties` when the logged-in user's role is
Property Manager, OR change GET /properties itself to use
_pm_assigned_property_ids() instead of created_by for the PM branch,
matching the logic already proven correct in /pm/properties and /pm/tickets.    


### [Fixed] Tenant could access /admin/* and /pm/* routes directly (P2/P3)
Root cause: no route-level role guards in App.js — each role's route
group (/admin, /pm, /owner, /tenant) rendered unconditionally regardless
of logged-in user's actual role. Fixed by adding a RequireRole wrapper
component that checks localStorage role against an allowed list before
rendering the layout, redirecting to the user's own dashboard otherwise.
Retested: Tenant navigating to /admin/users and /pm/properties now
redirects cleanly to /tenant/dashboard. Regression-checked: all four
roles' own dashboards still load normally.