# Campaign Management Visual QA Report

## Test Environment
- **Frontend URL:** `http://localhost:3000`
- **Backend URL:** `http://localhost:6900`
- **Test Account Used:** `demo@admin.com` (password: `password`)
- **Date/Time Tested:** 2026-05-31T11:45:00+08:00 (Local Dev Time)

---

## Pages and Modals Tested
1. **Login Page:** `/login`
2. **Dashboard Landing:** `/dashboard`
3. **Campaign Management Page:** `/dashboard/campaign`
4. **Manual Event Create Modal:** `components/campaign/modals/ManualEventCreateModal.tsx`
5. **Complete Details Modal (doubles as Edit):** `components/campaign/modals/CompleteEventDetailsModal.tsx`
6. **Confirm Event Action Modal:** `components/campaign/modals/ConfirmEventActionModal.tsx`
7. **Event Details Modal:** `components/campaign/modals/EventDetailModal.tsx`

---

## Summary
- **Overall Status:** **PASS** (10/10 test steps succeeded)
- **Major Issues:** None
- **Minor Issues:** 
  - Clicking "Edit" in the card actions menu opens the `CompleteEventDetailsModal` which displays the header **"Complete Details"** instead of **"Edit Event"**. While functional parity is maintained (all fields can be edited), this can lead to mild user confusion since the title does not match the clicked action.
- **Visual Issues:**
  - Layout spacing and responsive constraints are well handled. Spacing under the tabs is consistent.
  - The side navigation bar highlights active groups and elements appropriately.
- **Functionality Issues:** None. Form validations, search filters, state transitions (Draft -> Scheduled -> Published -> Cancelled), and API synchronization function correctly.

---

## Test Cases

| Case ID | Action Performed | Input Used | Expected Result | Actual Result | Status | Screenshot Reference |
|---|---|---|---|---|---|---|
| **TC-01** | Open app login page | N/A | Login page renders correctly with forms. | Rendered correctly, clean UI. | **PASS** | `01-login-page.png` |
| **TC-02** | Enter credentials & submit | `demo@admin.com` / `password` | Logs in and redirects to `/dashboard`. | Successful login, dashboard metrics load. | **PASS** | `02-dashboard-loaded.png` |
| **TC-03** | Navigate to Campaigns | Sidebar click "Campaign Management" | Campaign management loads at `/dashboard/campaign`. | Correct route loaded, page title and empty state or event cards appear. | **PASS** | `03-campaign-page-loaded.png` |
| **TC-04** | Empty form submission | N/A | Manual Create Modal opens; submitting empty triggers required validation error messages. | Proper client-side form validation error messages display. | **PASS** | `04-manual-create-empty-validation.png` |
| **TC-05** | Form validation check | Start: `10:00 AM`, End: `08:00 AM`, Goals: `-10` | Error messages warn about end-time preceding start-time and negative goal bounds. | Fields blocked by validation constraints. | **PASS** | N/A (Inspected interactively) |
| **TC-06** | Create valid draft event | Title: `QA Test Blood Drive`<br>Org: `QA Test Org`<br>Date: `2026-06-15`<br>Goal: `50` | Event created successfully, modal closes, draft card appears. | Saved correctly, card appeared in Draft list. | **PASS** | `05-manual-create-filled.png` |
| **TC-07** | Test actions dropdown | Click three-dots card button | Dropdown menu opens with contextual actions. | Opened correctly. Closes when clicking outside. | **PASS** | `06-event-card-actions-menu.png` |
| **TC-08** | View event details | Click "View Details" | Details modal displays all matching fields. | Modal loaded with readable metadata. | **PASS** | `07-event-details-modal.png` |
| **TC-09** | Edit event details | Update title to `QA Test Blood Drive Updated` | Changes update the card model dynamically. | Saved successfully, card updated immediately. | **PASS** | `08-edit-event-modal.png` |
| **TC-10** | Schedule incomplete event | Click "Complete" -> Save as Scheduled | Setup status changes to "Scheduled" (visible in all tabs). | Status updated without full reload. | **PASS** | N/A (Inspected interactively) |
| **TC-11** | Publish event | Click "Publish" -> Confirm | Confirmation modal appears; event is published. | Card status badge shifts to "Published". | **PASS** | `10-publish-result.png` |
| **TC-12** | Cancel event | Click "Cancel" -> Confirm | Confirmation modal appears; event is cancelled. | Status updates to "Cancelled" and invalid actions disabled. | **PASS** | `09-cancel-confirmation.png` |

---

## Bugs Found

### 1. Inconsistent Header on "Edit" Modal
- **Severity:** Low
- **Steps to reproduce:**
  1. Open three-dots menu on an event card.
  2. Click **Edit**.
- **Expected result:** Modal title displays "Edit Event Details" or "Edit Event".
- **Actual result:** Modal title displays **"Complete Details"** with subtitle *"Complete the operational, donor, and public registration details before scheduling or publishing."*
- **Likely component:** `components/campaign/modals/CompleteEventDetailsModal.tsx`
- **Suggested Fix:** Add a prop (e.g. `mode?: "edit" | "complete"`) to dynamically change the header title and text:
  ```tsx
  const isEdit = mode === "edit";
  // ...
  <p className="text-xs font-semibold uppercase tracking-widest text-rose-600">
    {isEdit ? "Edit Details" : "Complete Details"}
  </p>
  ```

---

## Screenshots

The following screenshots are saved under `test-results/campaign-page/`:
- **`01-login-page.png`**: Login screen with credential entry.
- **`02-dashboard-loaded.png`**: Dashboard panel following successful login redirection.
- **`03-campaign-page-loaded.png`**: Campaign Management page overview.
- **`04-manual-create-empty-validation.png`**: Visual representation of client-side validation errors when submitting an empty form.
- **`05-manual-create-filled.png`**: The created event card listed under the Draft filter.
- **`06-event-card-actions-menu.png`**: Contextual actions menu (three-dots) dropdown triggered on the event card.
- **`07-event-details-modal.png`**: Event details display modal.
- **`08-edit-event-modal.png`**: Modal displaying edit data for the created event.
- **`09-cancel-confirmation.png`**: Confirmation warning modal triggered when selecting "Cancel".
- **`10-publish-result.png`**: Successful state transition displaying the event badge marked as "Published".

We have also saved a full interactive browser video run:
- **`campaign_visual_qa.webp`**: Full video demonstrating all testing flows.

---

## Recommendations
1. **Fix modal title mismatch:** Implement the proposed fix above to make the header contextual depending on whether the user selected "Edit" or "Complete Details".
2. **Standardize Action buttons in footer:** Some cards display direct action buttons in their footer (like `Complete`, `Publish`, `Cancel`) while others only list actions inside the three-dots. Standardizing this can improve consistency.
