# UNITE Mobile App Design Guide

This guide is derived from the aesthetics of the UNITE Blood Bank SaaS web platform. Use these guidelines to ensure the mobile app matches the premium, modern, and clean enterprise feel of the web frontend.

![Web Dashboard Reference](C:\Users\Admin\.gemini\antigravity-ide\brain\e41351b5-b030-4356-925a-3472107832b4\dashboard_page_1781512384618.png)

## 1. Brand Identity & Aesthetic
- **Logo Stylization**: Lowercase `unite` in extrabold, close-spaced text.
- **Aesthetic Style**: Modern, clean, airy enterprise-grade SaaS design. It relies on light background layers, high-contrast typography, clear margins, and generous whitespace.
- **Dark/Light Mode**: Primary design is optimized for Light Mode, leaning heavily on white cards over a subtle light-slate background to establish depth without heavy shadows.

## 2. Color Palette

### Primary & Accent Colors
- **Brand Red** (`#DC2626` / Tailwind: `brand-red` / `red-600`): The primary focal color. Used for logo accents, primary actions (buttons), active navigation states, and accent highlights.
- **Brand Blue** (`#2563EB` / Tailwind: `blue-600`): Secondary accent color. Used for specific action highlights, secondary filters, and interactive links.

### Neutral Colors (Backgrounds & Text)
- **Main Background**: Slate-50 (`#F8FAFC`). Use this for the root view background in the mobile app.
- **Card & Form Backgrounds**: White (`#FFFFFF`). Used for containers, forms, bottom navigation bars, and list items.
- **Borders & Dividers**: Slate-200 (`#E2E8F0`) for thin structural dividers, Slate-300 (`#CBD5E1`) for form element outlines.
- **Primary Text**: Slate-900 (`#0F172A`) for main headings and titles.
- **Body Text**: Slate-800 (`#1E293B`) or Slate-700 (`#334155`) for standard body text and labels.
- **Muted Text**: Slate-500 (`#64748B`) or Slate-400 (`#94A3B8`) for secondary information, placeholders, and metadata.

### Status & Semantic Colors
- **Success / Active**: Emerald-600 (`#10B981` / `#16A34A`) for published statuses, safe stock levels.
- **Warning / Low**: Orange-500 (`#F97316` / `#F59E0B`) for low inventory alerts.
- **Critical / Cancelled**: Red-600 (`#DC2626` / `#E11D48`) for cancelled events or critical stock levels.

## 3. Typography
The system uses a clean sans-serif system font stack. Maintain this hierarchy for native mobile components:

- **Logo/Branding**: `Extrabold`, `Tracking Tight` (approx. 36px/`text-4xl` equivalent for splash screens, 24px/`text-2xl` for nav headers).
- **Header Titles (Screen Titles)**: `Bold`, 24px-30px (`text-2xl` to `text-3xl`).
- **Sub-headings (Section Titles)**: `Semi-bold`, 16px-18px (`text-base` to `text-lg`).
- **Body & Inputs**: `Regular`, 14px (`text-sm`).
- **Metadata / Badges**: `Medium` or `Semi-bold`, 11px-12px (`text-xs`).

## 4. UI Elements & Components

### Corner Radius (Shape)
Rounded corners are a signature part of the aesthetic:
- **Buttons, Inputs, Selects**: 12px radius (`rounded-xl`).
- **Cards, Main Containers, Modals**: 16px radius (`rounded-2xl`).
- **Avatars, Small Icons**: 6px-8px radius (`rounded-md` / `rounded-lg`).
- **Pills / Status Badges**: Capsule shape (`rounded-full`).

### Buttons
- **Primary Button**: Solid Brand Red background, white text. Height of `44px` minimum (touch target standard). 12px border radius. Hover/Pressed state transitions to a slightly darker or 90% opacity red.
- **Secondary Button**: White background, Slate-300 border, Slate-900 text. Height of `44px`. Hover/Pressed state transitions to a subtle Slate-100 background.

### Cards & Containers
- Flat containers with a subtle `Slate-200` 1px border.
- Generous internal padding (16px to 20px).
- Very soft, light shadows (`shadow-sm` equivalent) to lift cards slightly off the `Slate-50` background.

![Donor Dashboard Reference](C:\Users\Admin\.gemini\antigravity-ide\brain\e41351b5-b030-4356-925a-3472107832b4\donor_dashboard_page_1781512462569.png)

## 5. Mobile Specific Layout Recommendations

### Navigation Strategy
Since mobile doesn't support the wide left-sidebar layout of the web app, transition to a **Bottom Navigation Bar**:
- **Admin App**: `Dashboard`, `Events`, `Inventory`, `Staff`. (Settings can be a top-right header icon).
- **Donor App**: `Home/Dashboard`, `Find Drives`, `My Profile`.
- The active bottom nav icon should be Brand Red, while inactive icons should be Slate-500.

### Iconography
- Use clean, stroke outline icons (similar to **Lucide** or **Heroicons** outline variants).
- Avoid heavy, solid filled icons except for indicating active states in the bottom navigation bar.
- Keep stroke widths consistent (typically 1.5px or 2px).

### Forms & Inputs
- Form fields should have a white background, a `Slate-300` border, and a height of `44px` to `48px` for easy tapping.
- Use `Slate-400` for placeholder text.
- Active/focused fields should highlight with a Brand Red outline or ring to match the web's `focus-visible` behavior.

> [!TIP]
> **Component Reusability**
> If building with React Native, you can leverage tools like **NativeWind** to reuse the exact Tailwind utility classes (e.g., `bg-slate-50`, `rounded-2xl`, `text-brand-red`) directly from your Next.js project to perfectly align the aesthetic without rebuilding your design tokens from scratch.
