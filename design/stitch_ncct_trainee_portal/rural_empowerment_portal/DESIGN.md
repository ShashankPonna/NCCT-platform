---
name: Rural Empowerment Portal
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#44474d'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#74777e'
  outline-variant: '#c4c6ce'
  surface-tint: '#4b5f7f'
  primary: '#000d20'
  on-primary: '#ffffff'
  primary-container: '#0b2340'
  on-primary-container: '#768bad'
  inverse-primary: '#b2c8ed'
  secondary: '#a63b00'
  on-secondary: '#ffffff'
  secondary-container: '#fc6c29'
  on-secondary-container: '#5a1c00'
  tertiary: '#000c25'
  on-tertiary: '#ffffff'
  tertiary-container: '#00214f'
  on-tertiary-container: '#5288ea'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#b2c8ed'
  on-primary-fixed: '#031c39'
  on-primary-fixed-variant: '#334866'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004494'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  status-shortlisted: '#065F46'
  status-pending: '#92400E'
  status-rejected: '#991B1B'
  surface-card: '#FFFFFF'
  border-low-contrast: '#E5E7EB'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  mobile-width: 390px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 16px
  touch-target: 44px
---

## Brand & Style

The design system is engineered for the NCCT Platform, focusing on rural youth and cooperative workers across India. The brand personality is **authoritative yet accessible**, bridging the gap between formal government service and a supportive learning environment. It communicates trust, stability, and progress.

The aesthetic follows a **Corporate / Modern** style with high-contrast elements to ensure accessibility for first-time digital users. We prioritize clarity over decorative flair, using a "Government-Plus" approach: the structural reliability of an official portal combined with the warmth and vibrancy of a modern educational app. Key attributes include heavy legibility, intuitive navigation, and high-contrast affordances.

## Colors

The palette is anchored by a **Deep Navy (#0B2340)** to establish institutional credibility. **Warm Orange (#F26522)** is reserved strictly for primary Call-to-Action (CTA) elements, ensuring they stand out against the professional backdrop. **Mid-Blue (#1E5FBF)** serves as the interactive color for standard links and buttons.

The background uses a **Light Warm-Gray (#F5F5F5)** to reduce screen glare and provide a soft contrast for the **Pure White (#FFFFFF)** cards. This "Paper-on-Stone" layering logic helps users distinguish between the workspace (cards) and the environment. All color pairings must meet WCAG AA standards for contrast to support users in outdoor or high-glare environments.

## Typography

This design system utilizes **Plus Jakarta Sans** for headings to provide a modern, geometric, and bold "official" look. For body text and labels, **Noto Sans** is used for its exceptional legibility and support for diverse character sets, essential for a multi-lingual Indian context.

Typography is scaled to be slightly larger than standard web defaults to accommodate users who may have varying levels of digital literacy or visual acuity. Bold weights are used frequently for labels to ensure visual hierarchy is unmistakable.

## Layout & Spacing

The layout employs a **Fixed Grid** model on desktop (1280px) and a **Fluid Grid** on mobile (390px). 

- **Desktop:** A 12-column grid with 24px gutters and 64px side margins. Content is centered.
- **Mobile:** A 4-column grid with 16px margins. 
- **Spacing Rhythm:** An 8px base unit (8, 16, 24, 32, 48, 64) governs all padding and margins to maintain a consistent vertical rhythm. 

All interactive elements, specifically in the bottom navigation and form inputs, must respect a minimum **44px touch target** to ensure ease of use on mobile devices for workers in the field.

## Elevation & Depth

To maintain an "Official" feel, the system avoids complex shadows or blurs. Depth is primarily communicated through **Tonal Layers** and **Low-Contrast Outlines**.

1.  **Level 0 (Background):** Warm-gray (#F5F5F5) - the base canvas.
2.  **Level 1 (Cards):** White (#FFFFFF) with a 1px border (#E5E7EB). Shadows are used sparingly, restricted to a soft, 4px blur "Ambient Shadow" only on hover or active states to indicate interactivity.
3.  **Level 2 (Modals/Popovers):** White (#FFFFFF) with a medium-diffused shadow (12px blur, 10% opacity black) to separate critical actions from the dashboard.

This flat-but-layered approach ensures the UI remains performant on lower-end mobile devices while still providing clear spatial metaphors.

## Shapes

The design system uses a **Rounded** shape language (8px / 0.5rem base radius). This choice balances the seriousness of a government platform with the approachability of a modern learning tool. 

- **Standard Buttons & Cards:** 8px (Rounded).
- **Status Pills & Skill Chips:** Full-round (Pill-shaped) to distinguish them from structural elements.
- **Input Fields:** 8px to match buttons, creating a cohesive form-factor.

## Components

### Cards
Dashboard cards feature a white background, 8px corner radius, and a 1px light border. They follow a vertical stack: **Icon (Top Left)** -> **Label (Bold)** -> **Short Description (Muted)**. For high-priority metrics, use a Deep Navy background with white text.

### Buttons & Chips
- **CTA Button:** Solid Warm Orange (#F26522) with white bold text.
- **Secondary Button:** Solid Mid-Blue (#1E5FBF) or Mid-Blue outline.
- **Skill Chips:** 
    - *Acquired:* Filled with light blue background and dark blue text. 
    - *Missing:* Transparent background with a dashed 1px gray border and muted text.

### Status Pills
Pills use high-contrast background tints with dark text:
- **Success (Shortlisted/Approved):** Green tint.
- **Warning (Pending/Waitlisted):** Amber tint.
- **Critical (Rejected):** Red tint.
- **Neutral (Viewed):** Light gray tint.

### Navigation
- **Locale Pill Selector:** Located at the top right; a simple toggle or dropdown allowing quick switching between English and local languages (e.g., Hindi, Marathi).
- **Mobile Bottom Tab Bar:** Fixed at the base, 56px height. Icons should be 24px with 12px labels. Active state uses Mid-Blue with a 3px top indicator bar.

### Input Fields
Large, 48px height fields with persistent labels (never use placeholder-only labels). Ensure focus states are highly visible with a 2px Mid-Blue ring.