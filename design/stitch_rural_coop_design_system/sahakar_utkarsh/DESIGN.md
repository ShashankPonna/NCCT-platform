---
name: Sahakar Utkarsh
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#44474e'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#495f82'
  primary: '#001026'
  on-primary: '#ffffff'
  primary-container: '#0b2545'
  on-primary-container: '#778db2'
  inverse-primary: '#b1c7f0'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#001404'
  on-tertiary: '#ffffff'
  tertiary-container: '#002c0f'
  on-tertiary-container: '#3c9e57'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#b1c7f0'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#314769'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#95f8a7'
  tertiary-fixed-dim: '#79db8d'
  on-tertiary-fixed: '#00210a'
  on-tertiary-fixed-variant: '#005323'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-hero:
    fontFamily: Public Sans
    fontSize: 3rem
    fontWeight: '800'
    lineHeight: 3.5rem
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Public Sans
    fontSize: 2rem
    fontWeight: '800'
    lineHeight: 2.5rem
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 1.5rem
    fontWeight: '700'
    lineHeight: 2rem
    letterSpacing: 0em
  headline-md:
    fontFamily: Public Sans
    fontSize: 1.375rem
    fontWeight: '700'
    lineHeight: 1.75rem
    letterSpacing: 0em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 1.125rem
    fontWeight: '700'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-lg:
    fontFamily: Public Sans
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: 0em
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Public Sans
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Public Sans
    fontSize: 1rem
    fontWeight: '700'
    lineHeight: 1.25rem
    letterSpacing: 0.02em
  label-md:
    fontFamily: Public Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.125rem
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Public Sans
    fontSize: 0.75rem
    fontWeight: '700'
    lineHeight: 1rem
    letterSpacing: 0.05em
  tabular-data:
    fontFamily: Public Sans
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system is engineered for civic utility, high resilience, and civic trust. It bridges two disparate user cohorts: rural youth accessing cooperative training, certification, and agricultural business toolkits on entry-level Android devices in low-connectivity environments, and administrative officers managing records, accreditations, and curriculum compliance on desktop displays.

The aesthetic philosophy centers on **High-Contrast Utilitarianism with Structured Tactility**. Rather than treating accessibility as an afterthought or aesthetic penalty, the design leans deliberately into stark, structural clarity reminiscent of dependable institutional signage, technical field manuals, and robust ledgers.

### Visual Principles
- **Sunlight Readability:** High-contrast color ratios exceeding WCAG AAA standards across all primary interactive surfaces, engineered specifically to resist display wash-out on low-nits screens under direct tropical sunlight.
- **Bandwidth Frugality:** Decorative photography, heavy raster backdrops, complex CSS drop-shadow blurs, and canvas-intensive animations are strictly avoided. Visual hierarchy is achieved entirely through layout rhythm, crisp line weights, clean typographic scale, and solid-fill affordances.
- **Immediate Affordance:** Explicit, visible state distinctions. Every button, input, module card, and navigation hook uses thick bounding frames, unambiguous active states, and physical press offsets to eliminate doubt on low-cost resistive or worn capacitive touchscreens.
- **Institutional Authority & Warmth:** Deep cooperative navy signals permanence, accreditation, and administrative legitimacy; lively marigold amber drives action and progression; agricultural emerald denotes economic growth, cooperative self-reliance, and livelihood vitality.

## Colors

The palette operates under a default `light` mode optimized for daytime legibility and stark visual definition. Pure decorative tints and subtle low-contrast pastel gradients are prohibited.

### Palette Architecture
- **Primary Navy (`#0B2545`):** Serves as the bedrock of governance and institutional credibility. Applied to top headers, primary actions, core card outlines, and high-level navigation chrome. On active interactive states, shifts to deep ocean `#133E87`.
- **Secondary Action Amber (`#D97706` / Accent `#F59E0B`):** The primary engine of user advancement. Reserved strictly for calls to action, enrollment confirmations, primary action highlights, and critical progress badges. When paired with `#0F172A` text, it satisfies AAA requirements; when paired with `#0B2545`, it creates immediate optical pull.
- **Tertiary Growth Emerald (`#15803D` / Dark `#166534`):** Represents agricultural success, cooperative certification status, verified identity, and financial clearance. Delivers clear semantic validation for positive states and training completion markers.
- **Neutral Slate Ink (`#0F172A`):** The foundational ink for typography and structural line work. Avoids generic mid-greys; secondary text retains high contrast by anchoring at `#334155` (Slate 700), maintaining an 8.5:1 minimum contrast ratio against canvases.
- **Base Canvases (`#FFFFFF` and `#F8FAFC`):** Surfaces are structured through flat, crisp off-white fills separated by distinct 1.5px and 2px borders, eliminating muddy middle tones.

### Semantic Ratios & Rule Sets
- All running copy and data tables must sustain a contrast ratio of at least `7:1` against their immediate container surface.
- Form field borders must use `#0F172A` or `#334155` in unfocused resting states to remain immediately identifiable on dim liquid-crystal panels.
- Dangerous or destructive actions utilize high-intensity vermilion `#B91C1C` framed with dark `#7F1D1D`.

## Typography

This system uses **Public Sans** across all typographic applications. Public Sans is chosen for its unbending structural neutrality, wide open apertures, generous x-height, and robust rendering across Android WebViews, older Chromium builds, and basic rendering engines.

### Implementation Rules
- **Base Size Floor:** The baseline body size for interactive viewports is strictly clamped to `1rem` (16px). Sizing down below 16px for input targets, descriptions, or core body text is prohibited to prevent automatic layout zooming on mobile browsers and maintain effortless readability.
- **Tabular Figures:** All numerical tables, registration numbers, batch codes, test scores, and stipend sums must implement `font-variant-numeric: tabular-nums` to guarantee aligned columns in dense administrative rosters.
- **Letter Spacing & Line Height:** Line heights are calibrated generously (`1.5` to `1.6` on body copy) to assist neo-literate users and students tracking lines on scratched or pocket-sized displays.
- **Multilingual Support:** Public Sans pairs seamlessly with standard regional Indian Unicode fonts (such as Noto Sans Devanagari, Gujarati, or Tamil) while preserving line-height consistency without jitter during dynamic translation switching.

## Layout & Spacing

The layout model adapts between high-density administrative screens and compact, single-column field interfaces without computational overhead.

### Layout Mechanics
- **Mobile (< 768px):** Single-column vertical stack with `margin: 1rem` (16px) canvas padding and `gutter: 1rem`. Content flows linearly with touch surfaces occupying the full horizontal grid span. Critical actions anchor fixed to the lower viewport area.
- **Tablet (768px – 1023px):** 6-column fluid responsive grid with `margin: 1.5rem` and `gutter: 1rem`. Suited for field tablets and training center kiosks.
- **Desktop (≥ 1024px):** 12-column fixed/fluid hybrid system with a persistent `260px` administrative sidebar and `margin: 2rem`. Content cards lock to a maximum reading column span to prevent line lengths exceeding 75 characters.

### Touch Targets & Spatial Density
- Every standalone interactive target (buttons, checkboxes, selection items, dropdown triggers) adheres to an uncompromising minimum hit box of **48px × 48px**, surrounded by at least `0.5rem` (`space-sm`) clearance.
- Vertical gap rhythms between stacked question cards, course modules, or form groups default to `space-md` (16px) or `space-lg` (24px) to avoid accidental mis-taps on worn mobile displays.

## Elevation & Depth

To maximize performance on lower-tier hardware and guarantee absolute visibility under bright outdoor illumination, this system eliminates blurred, low-opacity drop shadows. Depth and hierarchy are articulated via **Bold Borders, Structural Contrasts, and Solid Tactile Offsets**.

### Depth Layers
- **Surface Tier 0 (Canvas Base):** Clean `#F8FAFC` background. Completely flat.
- **Surface Tier 1 (Module Cards, Data Panels, Dialogue Surfaces):** Solid `#FFFFFF` fills circumscribed by sharp `1.5px` solid `#0F172A` borders.
- **Surface Tier 2 (Interactive Floating Elements, Flyout Modals):** Hard-edged tactile offset. A crisp, non-blurred offset border effect constructed with `box-shadow: 3px 3px 0px 0px #0B2545`.

### State Elevations
- **Hover & Focus:** The structural outline expands from `1.5px` to `2.5px` with a high-contrast focus ring (`3px solid #D97706` offset by `2px white`).
- **Active / Pressed State:** The hard-offset shadow snaps to `0px 0px 0px 0px`, physically translating the element `2px` down and `2px` right (`transform: translate(2px, 2px)`). This gives immediate, unmistakable visual feedback confirming that a touch or click registered, even if the device experiences network latency or CPU throttle.

## Shapes

A controlled **Soft** roundedness scale (`roundedness: 1`) is enforced throughout the ecosystem. 

### Geometric Rationale
- **Core Curvature:** Base buttons, input fields, badges, and card boundaries utilize `0.25rem` (4px) radii. Large structural surfaces (dialogs, master course containers) step up to `0.5rem` (8px). 
- **Functional Intent:** Rounding is intentionally restrained. Excessive pill shapes or bubble geometry reduce usable screen area inside form fields and compromise the institutional, ledger-like authority essential for an official national training body. Sharp corners with subtle 4px softenings ensure maximal touch density and crisp boundary rendering even on sub-HD mobile screens.
- **Status Indicators:** Micro-badges, notification pips, and completion dots employ pure geometry (circular indicators or sharp square tag markers) with distinct 1px outlines.

## Components

### Buttons
- **Primary Action (Enroll, Submit, Verify, Save):** Solid `#D97706` fill with bold `#0F172A` text, bordered by `2px solid #0F172A`. Minimum height 48px. Physical active press offset (`translate(2px, 2px)` with collapsing offset border).
- **Secondary (Institutional / Navigation):** Deep navy `#0B2545` fill with `#FFFFFF` text. Hard outline. Used for master filters, certificate generation, and top-level commands.
- **Outline (Secondary Actions, Back, Cancel):** White `#FFFFFF` fill with `2px solid #0B2545` border and `#0B2545` bold text.
- **Danger (Revoke, Delete, Disqualify):** Solid white fill with `2px solid #B91C1C` border and `#B91C1C` text; transitions on focus/active to solid `#B91C1C` fill with white text.

### Form Inputs & Selectors
- **Input Fields:** Unbroken `1.5px solid #0F172A` border with `#FFFFFF` background. Minimum height 48px. 
- **Persistent Labels:** Floating or placeholder-only labels are prohibited. Labels permanently rest above the input field in `label-md` bold styling with clear required markers (`*`).
- **Helper & Validation Text:** Positioned directly below the field. Error states turn the entire border to `2px solid #B91C1C` accompanied by an explicit SVG warning glyph (never relying on color alone).

### Checkboxes & Radio Buttons
- Sized explicitly at `24px × 24px` with a `2px solid #0F172A` perimeter, situated inside a touch box of at least 48px.
- Checkboxes use an unmistakable thick SVG tickmark with `#0B2545` background on select. Radio buttons feature a high-contrast solid interior circle.

### Chips & Status Badges
- Encased in a `1px solid #0F172A` outline.
- **Success / Certified:** `#DCFCE7` background with `#166534` text.
- **In-Progress / Pending Review:** `#FEF3C7` background with `#92400E` text.
- **Administrative Archive:** `#F1F5F9` background with `#334155` text.

### Cards & Module Containers
- Bound by `1.5px solid #0B2545` borders with an inner padding of `1.25rem` (20px).
- Headers display clear visual hierarchy with module numbers, status chips, and tabular registration metadata cleanly delineated by horizontal rule dividers (`1px solid #E2E8F0`).
- No transparent background overlays; cards maintain strict `#FFFFFF` solid backdrops.

### Navigation Systems
- **Mobile Bottom Navigation Bar:** Fixed to the screen base. Height 64px. Solid `#0B2545` background. Features 4 to 5 high-contrast icon-and-label tabs. Selected tab is illuminated with a solid `#D97706` upper underline bar (3px) and bold white text.
- **Desktop Sidebar Navigation:** Persistent 260px wide left sidebar in `#0B2545` with `#FFFFFF` ink. Links display an unmistakable 48px touch/click target with explicit hover fills (`#133E87`) and active states indicated by an amber `#D97706` 4px vertical anchor marker on the left edge.