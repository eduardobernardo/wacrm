// ============================================================
// Department colors — single source of truth for visual identity.
//
// Five swatches, chosen for enough perceptual distance to be
// distinguishable in lists and dense tables, but each muted enough
// to coexist with the app's other surfaces. Order matters — the
// picker UI iterates in this order.
// ============================================================

export const DEPARTMENT_COLORS = [
  'slate',
  'amber',
  'teal',
  'rose',
  'violet',
] as const;

export type DepartmentColor = (typeof DEPARTMENT_COLORS)[number];

export const DEFAULT_DEPARTMENT_COLOR: DepartmentColor = 'slate';

// Tailwind classes for the swatch (4px left bar) on a list/card row.
// `text-*` and `bg-*/20` on the badge variant. Each entry covers
// every place a department color can appear.
//
// `ring` is consumed by the ColorPicker's selected state. Using the
// static class names here (not inline styles / dynamic hex) keeps
// Tailwind's scanner able to pick them up and keeps the palette as
// the single source of truth.
export const DEPARTMENT_COLOR_STYLES: Record<
  DepartmentColor,
  {
    /** Left bar on a list card. */
    bar: string;
    /** Solid background dot. */
    dot: string;
    /** Faint background for badges / chips. */
    chipBg: string;
    /** Foreground text for badges / chips. Light + dark aware. */
    chipFg: string;
    /** Border for chip / pill outlines. */
    border: string;
    /** Tailwind ring color for the selected swatch. */
    ring: string;
  }
> = {
  slate: {
    bar: 'bg-slate-500',
    dot: 'bg-slate-500',
    chipBg: 'bg-slate-500/15',
    chipFg: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-500/40',
    ring: 'ring-slate-500',
  },
  amber: {
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    chipBg: 'bg-amber-500/15',
    chipFg: 'text-amber-600 dark:text-amber-300',
    border: 'border-amber-500/40',
    ring: 'ring-amber-500',
  },
  teal: {
    bar: 'bg-teal-500',
    dot: 'bg-teal-500',
    chipBg: 'bg-teal-500/15',
    chipFg: 'text-teal-600 dark:text-teal-300',
    border: 'border-teal-500/40',
    ring: 'ring-teal-500',
  },
  rose: {
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    chipBg: 'bg-rose-500/15',
    chipFg: 'text-rose-600 dark:text-rose-300',
    border: 'border-rose-500/40',
    ring: 'ring-rose-500',
  },
  violet: {
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
    chipBg: 'bg-violet-500/15',
    chipFg: 'text-violet-600 dark:text-violet-300',
    border: 'border-violet-500/40',
    ring: 'ring-violet-500',
  },
};

/** Human label for the picker and accessible name for the swatch button. */
export const DEPARTMENT_COLOR_LABELS: Record<DepartmentColor, string> = {
  slate: 'Cinza',
  amber: 'Âmbar',
  teal: 'Verde-azulado',
  rose: 'Rosa',
  violet: 'Violeta',
};

export function isDepartmentColor(value: unknown): value is DepartmentColor {
  return (
    typeof value === 'string' &&
    (DEPARTMENT_COLORS as readonly string[]).includes(value)
  );
}

export function stylesFor(color: DepartmentColor | null | undefined) {
  return DEPARTMENT_COLOR_STYLES[color ?? DEFAULT_DEPARTMENT_COLOR];
}
