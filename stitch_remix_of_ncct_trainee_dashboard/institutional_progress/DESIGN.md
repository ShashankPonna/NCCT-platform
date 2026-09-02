---
name: Institutional Progress
colors:
  surface: '#FAFAF5'
  surface-dim: '#DADAD5'
  surface-bright: '#FAFAF5'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#F4F4EF'
  surface-container: '#EEEEE9'
  surface-container-high: '#E8E8E3'
  surface-container-highest: '#E3E3DE'
  on-surface: '#1A1C19'
  on-surface-variant: '#44474D'
  inverse-surface: '#303032'
  inverse-on-surface: '#f2f0f2'
  outline: '#74777E'
  outline-variant: '#C4C6CE'
  surface-tint: '#515f76'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0B2340'
  on-primary-container: '#768BAD'
  inverse-primary: '#b8c7e1'
  secondary: '#a63b00'
  on-secondary: '#ffffff'
  secondary-container: '#FC6C29'
  on-secondary-container: '#5A1C00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#00214F'
  on-tertiary-container: '#5288EA'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3fe'
  primary-fixed-dim: '#b8c7e1'
  on-primary-fixed: '#0d1c2f'
  on-primary-fixed-variant: '#39485d'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#b9c6e7'
  on-tertiary-fixed: '#0d1b34'
  on-tertiary-fixed-variant: '#3a4762'
  background: '#fbf9fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
  surface-card: '#FFFFFF'
  status-pending: '#EAB308'
  status-rejected: '#BA1A1A'
  status-success: '#10B981'
  cta: '#F26522'
  cta-hover: '#D94E10'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Fira Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Fira Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Fira Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Fira Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Fira Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  touch-target: 44px
  margin-mobile: 16px
  margin-desktop: 32px
  gutter: 16px
  max-width-desktop: 1200px
---

## Brand & Style

The design system is crafted to bridge the gap between rural learners and professional certification. The brand personality is **Institutional yet Accessible**, balancing the authority of a national government body with the welcoming nature of a community-focused learning hub.

The visual style is **Corporate / Modern**, specifically tailored for high legibility and ease of use. It avoids the austerity of traditional bureaucracy by using vibrant accents and soft elevation, ensuring the interface feels like a path to progress rather than a complex digital hurdle. It is optimized for high-glare environments and users who may be navigating digital services for the first time on mobile devices.

## Colors

The color palette follows Material 3 logic to ensure high contrast and semantic clarity.

- **Primary (Deep Navy):** Instills trust and institutional weight. Used for structural navigation and headers.
- **Secondary (Warm Orange):** Used for critical conversion points and primary calls to progress.
- **Surface Strategy:** Employs five levels of surface containers to create depth without relying on heavy shadows. `surface-card` is specifically mapped to pure white for maximum legibility.
- **Status Colors:** Explicit roles are defined for `pending` (Amber), `rejected` (Red), and `success/shortlisted` (Emerald) to provide immediate feedback on application and attendance states.
- **Action Layer:** A dedicated `cta` role is used for primary buttons to ensure they remain distinct from secondary brand elements.

## Typography

This system uses a dual-font approach to balance authority with readability.

- **Headlines:** Uses **Hanken Grotesk** for all titles and headings. Its geometric construction provides a clean, modern, and authoritative appearance suitable for a national platform.
- **Body & Content:** Uses **Fira Sans** for all other text roles. As a humanist sans-serif, it offers superior legibility on mobile screens and for users with varying digital literacy.
- **Labels:** All label roles must be rendered in **Small-Caps** (simulated via uppercase with increased letter spacing) to distinguish them from body text and metadata.
- **Icons:** All iconography must use **Material Symbols Outlined** for a consistent, lightweight visual language.

## Layout & Spacing

The system adopts a **Fixed Grid** model on desktop to maintain an organized, centered layout typical of professional portals. On mobile, it transitions to a **Fluid Grid**.

- **Vertical Rhythm:** Built on an 8px base unit. 
- **Accessibility:** All interactive elements (chips, links, buttons) must maintain a minimum touch target of **44px** to accommodate users in high-glare or mobile-heavy environments.
- **Desktop Grid:** 12-column system with a 1200px container.
- **Mobile Grid:** Single column with 16px side margins.

## Elevation & Depth

Visual hierarchy is primarily established through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Surfaces:** Use the `surface-container` tiers to stack elements. Higher tiers (e.g., `surface-container-highest`) indicate elements closer to the user, such as dialogs.
- **Cards:** Use `surface-card` with an `outline-variant` border (1px). A very soft, high-diffusion shadow (Blur 4px, Opacity 5%) is permitted only to provide a subtle "lift" from the background.
- **Interactive States:** On hover or focus, increase the border contrast to `outline` or shift the surface color by one container tier to indicate interactivity.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a professional and structured aesthetic that is more approachable than sharp corners but maintains the seriousness required for an institutional platform.

- **Components:** Buttons, input fields, and cards utilize the default 4px (Soft) radius.
- **Status Chips:** Use a fully rounded (pill) shape to clearly distinguish status indicators from interactive buttons.
- **Dashed Borders:** For "Missing" states (e.g., missing skills), use a 1px dashed `outline` on a Soft-radius container.

## Components

- **Buttons:** 
    - **Primary Action (CTA):** Uses the `cta` background with `on-primary` text. Uses `cta-hover` for interaction.
    - **Secondary Action:** Uses `outline` border with `primary` text.
- **Input Fields:** `surface-container-lowest` background with a 1px `outline-variant` border. Labels must remain visible above the field (not floating) to ensure clarity for all users.
- **Chips & Status:** 
    - **Status Pills:** Backgrounds are derived from status colors at 15% opacity with high-contrast text of the same hue.
    - **Skill Chips:** Solid `primary-container` fill for "Achieved" skills; dashed `outline` for "Missing" skills.
- **Cards:** Use `surface-card` with `outline-variant`. Internal padding is fixed at 16px. 
- **Navigation:**
    - **Header:** Deep Navy (`primary`) background with `on-primary` content.
    - **Role Badges:** High-contrast pill-shaped badges in the header to indicate "Trainee" or "Admin" roles.
- **Empty States:** Must include a low-opacity Material Symbol, a `headline-sm` title, and a clear `cta` button to "Get Started."