# UI Component Migration Guide

## Overview
We are gradually migrating the UNITE frontend away from `@heroui/react` (HeroUI) components towards simple, predictable, and reusable shared React components located in `unite-frontend-enterprise-prototype/components/ui/`.

### Why the Migration?
- **Predictability & Control**: Complex library abstractions often cause styling inconsistencies, hydration errors, and difficult-to-debug layout issues (e.g., clipping and z-index battles).
- **Aesthetic Consistency**: Shared components are easier to theme exactly to our custom design system and standard utilities.
- **Maintainability**: A thin abstraction over native HTML elements (using basic state hooks for `open/close`) reduces dependency overhead and ensures long-term stability.

## Migration Status

### Phase 1: Campaign Management (Completed)
- Audited `app/dashboard/campaign/page.tsx` and `components/campaign/*`.
- Verified that event cards, actions menus, and modals have already been transitioned to custom wrappers.
- Replaced the remaining HeroUI usage (the main header options and filter bar "More statuses" dropdown) with a new shared `AppDropdown` component.

## New Shared Components

### Dropdown (`components/ui/dropdown.tsx`)
A simple, accessible `AppDropdown` component supporting:
- Click-outside and Escape-key closure.
- Flexible trigger rendering.
- `selectedKeys` for visual feedback on active items.
- Item `disabled` and `destructive` states.

**Usage:**
```tsx
import { AppDropdown } from "@/components/ui/dropdown";

<AppDropdown
  triggerClassName="..."
  trigger={<Icon />}
  onAction={(key) => handleAction(key)}
  items={[
    { key: "edit", label: "Edit Event" },
    { key: "delete", label: "Delete Event", destructive: true }
  ]}
/>
```

### Phase 2: Staff Management (Completed)
- Transitioned `AddStaffModal.tsx`, `EditStaffModal.tsx`, and `ReviewSignupModal.tsx` from `HeroUI` `Select` to custom `components/ui/select.tsx`.
- Replaced the `HeroUI` filter `Dropdown` in `StaffTable.tsx` with a flexible `AppPopover` implemented in `components/ui/dropdown.tsx`.

### Phase 3: Inventory & Settings (Completed)
- Replaced the `HeroUI` `Calendar` and `Popover` used for date picking in the Inventory transactions dashboard (`app/dashboard/inventory/page.tsx`) with a styled native `<input type="date">`.
- Replaced the `HeroUI` `Calendar` and `Popover` for banned dates selection in Organization Settings (`app/dashboard/settings/page.tsx`) with a styled native `<input type="date">`.

## Final Status
- All `@heroui/react` and `@internationalized/date` dependencies have been successfully audited, removed from code usage, and uninstalled from `package.json`. The migration to local, predictable React components for dropdowns, popovers, and inputs is fully complete across the dashboard.

### Phase 4: Skeleton Loading States (Completed)
- Replaced plain text loading indicators with a new reusable `components/ui/skeleton.tsx` library featuring tailored skeleton components (e.g., `CardSkeleton`, `CalendarSkeleton`, `MapSkeleton`).
- Upgraded the loading states across Campaign Management, Plotting Calendars, Coverage Map, and My Events pages to reduce visual layout shift and provide a modern, polished shimmer effect that aligns with the project's design system without introducing new UI dependencies.
