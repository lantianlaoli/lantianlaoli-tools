```markdown
# Design System Specification: The Digital Atelier

## 1. Overview & Creative North Star
**Creative North Star: "The Modern Scholar"**

This design system rejects the frantic, high-contrast density of contemporary SaaS interfaces in favor of an "Academic Editorial" aesthetic. It is inspired by the tactile quality of heavy-stock parchment, the precision of a well-set monograph, and the quiet clarity of a museum gallery.

To break the "template" look, this system utilizes **Intentional Asymmetry**. Instead of rigid, centered grids, we use generous, offset whitespace to guide the eye. Overlapping elements—such as a serif headline partially breaking the boundary of a surface container—create a sense of layered depth, moving the UI away from flat pixels toward a digital "workspace" that feels curated and artisanal.

---

## 2. Colors & Surface Philosophy

The palette is rooted in organic, earthy tones. We replace sterile whites with `background: #fffcf7` (Parchment) and harsh blacks with `on_background: #383831` (Charcoal Olive).

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. Structural definition must be achieved through **Background Tonal Shifts**.
- To separate a sidebar from a main feed, transition from `surface` to `surface_container_low`.
- To highlight a callout, use `surface_container_high` against the base background.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of paper.
- **Base Level:** `surface` (#fffcf7)
- **Secondary Content:** `surface_container_low` (#fcf9f3)
- **Interactive/Raised Elements:** `surface_container` (#f6f4ec)
- **Prominent Cards:** `surface_container_highest` (#eae8de)

### The Glass & Gradient Rule
For floating menus or command palettes, use **Glassmorphism**. Apply a 20px `backdrop-filter: blur()` to a semi-transparent version of `surface_container_lowest`.
- **Signature Texture:** Primary CTAs should not be flat. Apply a subtle linear gradient from `primary` (#99462a) to `primary_dim` (#8a3a1f) at a 145-degree angle to give the button a "pressed ink" depth.

---

## 3. Typography: The Editorial Engine

This system relies on the tension between the intellectual **Newsreader** (Serif) and the functional **Inter** (Sans-Serif).

* **Display & Headlines (Newsreader):** Used for storytelling and high-level navigation. The serif font evokes authority and history.
* *Constraint:* Always use a tighter letter-spacing (-0.02em) for `display-lg` to maintain a "printed" look.
* **Titles & Body (Inter):** Used for utility, data, and long-form reading.
* *Constraint:* `body-md` must have a generous line-height (1.6) to prioritize the "Readability First" mission.
* **Labels (Inter All-Caps):** Use `label-md` with 0.05em letter-spacing for secondary metadata to create a "technical blueprint" feel.

---

## 4. Elevation & Depth

### The Layering Principle
Hierarchy is achieved through "Tonal Stacking." An inner card should never use a shadow if a shift from `surface_container_low` to `surface_container_lowest` can define the boundary.

### Ambient Shadows
When a component must "float" (e.g., a dropdown), use an **Ambient Bloom**:
- `box-shadow: 0 12px 40px rgba(56, 56, 49, 0.06);`
- The shadow color is a low-opacity version of `on_surface`, ensuring it looks like natural light hitting paper, not a digital drop shadow.

### The "Ghost Border" Fallback
If contrast ratios or complex densities require a border, use the **Ghost Border**:
- `border: 1px solid rgba(186, 186, 176, 0.2);` (using `outline_variant` at 20% opacity). Never use 100% opacity borders.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_dim`), `on_primary` text, `rounded-md`. No border.
- **Secondary:** `surface_container_high` fill, `on_surface` text.
- **Tertiary (The "Scholar" Button):** Ghost border (20% opacity `outline`), `on_surface` text, Newsreader Serif font for a sophisticated flair.

### Input Fields
- **Default State:** A simple `surface_container` background with a 1px `outline_variant` at 10% opacity.
- **Focus State:** Transition the background to `surface_container_lowest` and increase border opacity to 40%. The label should shift to `primary` color.

### Cards
- **Construction:** Use `surface_container_low`.
- **Constraint:** Forbid the use of divider lines. Use `spacing-6` (2rem) of vertical white space to separate the header from the body text.

### Chips
- **Action Chips:** Use `secondary_container` with `on_secondary_container` text. These should be `rounded-full` to contrast against the mostly rectangular UI.

### Tooltips
- Small-scale `inverse_surface` with `inverse_on_surface` text. Use a 400ms delay to ensure they feel intentional, not intrusive.

---

## 6. Do’s and Don’ts

### Do:
- **Do** use asymmetric margins. If the left margin is `spacing-12`, try a right margin of `spacing-20` for editorial "breathing room."
- **Do** mix font families in the same block. A Newsreader Headline followed by an Inter sub-headline creates a high-end, bespoke feel.
- **Do** use the `primary` accent (#99462a) sparingly—only for primary actions and active states.

### Don’t:
- **Don't** use pure black (#000) or pure white (#fff). It breaks the "parchment" immersion.
- **Don't** use dividers or horizontal rules. If you feel you need a line, you actually need more whitespace.
- **Don't** use "Standard" 1px borders. Use tonal shifts or Ghost Borders only.
- **Don't** crowd the interface. If the screen feels 60% full, it is likely over-crowded for this system. Aim for 40% density.

---

## 7. Spacing & Rhythm
We utilize a base-4 derivative scale but skip values to enforce "Generous Whitespace."
- Use **`spacing-8` (2.75rem)** for section padding.
- Use **`spacing-16` (5.5rem)** for vertical separation between distinct conceptual blocks.
- Consistent use of `spacing-2` (0.7rem) for related label/input pairs ensures a tight, logical grouping within the "expansive" layout.