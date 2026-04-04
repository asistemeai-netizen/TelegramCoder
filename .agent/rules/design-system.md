# Design System & UI Rules

**Role:** UI/UX Designer Agent & Any Agent Modifying Visuals
**Directives:**

1. **USE DESIGN TOKENS:** NEVER use static base Tailwind colors (e.g., `bg-blue-500`, `text-teal-600`, `bg-red-400`) when building core UI elements. YOU MUST always map components to the thematic tokens defined in `tailwind.config.ts`: `primary`, `secondary`, and `accent` (e.g., `bg-primary`, `text-secondary`, `border-accent`).
2. **PREMIUM UI BY DEFAULT:** Ensure interfaces feel modern, dense, and premium. Apply consistent rounded corners (`rounded-lg`, `rounded-xl`, `rounded-2xl`), subtle depths (`shadow-sm`, `shadow-md`), and clear, breathing padding.
3. **USE BASE GLASSMORPHISM & PASTEL:** For generic containers, panels, and data cards, actively leverage the pre-defined `.glassmorphism` and `.card-pastel` utility classes found in `src/app/globals.css`.
4. **DYNAMIC CLASS MERGING:** Never use template literals with inline turnery for classes if it's complex. Always use the `cn` utility from `src/lib/utils.ts` for dynamic class merging and avoiding conflicts.
5. **NO INLINE STYLES:** Do not use `style={{...}}`. Always use Tailwind utility classes.
