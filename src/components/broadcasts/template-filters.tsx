'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Search, LayoutGrid, List, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CategoryFilter = 'Marketing' | 'Utility' | 'Authentication';

interface TemplateFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilters: Set<CategoryFilter>;
  onCategoryToggle: (category: CategoryFilter) => void;
  languageFilter: string | null;
  onLanguageChange: (language: string | null) => void;
  hasVariables: boolean;
  onHasVariablesChange: (value: boolean) => void;
  viewMode: 'cards' | 'list';
  onViewModeChange: (mode: 'cards' | 'list') => void;
  availableLanguages: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Utility', label: 'Utility' },
  { value: 'Authentication', label: 'Auth' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Single horizontal filter bar that wraps on narrow screens.
 *
 * Top row:  search input (flex-1)  +  Cards | List view toggle.
 * Bottom:   category chips  ·  language dropdown  ·  has-variables toggle.
 *
 * When any filter is active a small "Limpar filtros" link appears
 * so the user can reset everything in one tap.
 */
export function TemplateFilters({
  searchQuery,
  onSearchChange,
  categoryFilters,
  onCategoryToggle,
  languageFilter,
  onLanguageChange,
  hasVariables,
  onHasVariablesChange,
  viewMode,
  onViewModeChange,
  availableLanguages,
}: TemplateFiltersProps) {
  const hasActiveFilters =
    searchQuery !== '' ||
    categoryFilters.size > 0 ||
    languageFilter !== null ||
    hasVariables;

  function handleClearAll() {
    onSearchChange('');
    onLanguageChange(null);
    onHasVariablesChange(false);
    // Toggle each active category off — React batches these into
    // one render because they all fire synchronously in the same
    // event-handler tick.
    categoryFilters.forEach((c) => onCategoryToggle(c));
  }

  return (
    <div className="space-y-3">
      {/* ---- Top row: search + view toggle ---- */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar modelos..."
            className="pl-8"
          />
        </div>

        {/* Segmented control — Cards | List */}
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          <button
            onClick={() => onViewModeChange('cards')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
              viewMode === 'cards'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
              viewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </button>
        </div>
      </div>

      {/* ---- Bottom row: filter chips ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category multi-select chips */}
        {CATEGORIES.map((cat) => {
          const active = categoryFilters.has(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => onCategoryToggle(cat.value)}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all',
                active
                  ? 'border-primary/30 bg-primary-soft text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {cat.label}
              {active && <X className="ml-1 h-3 w-3" />}
            </button>
          );
        })}

        {/* Language dropdown */}
        {availableLanguages.length > 0 && (
          <Select
            value={languageFilter ?? ''}
            onValueChange={(v) => onLanguageChange(v || null)}
          >
            <SelectTrigger size="sm" className="h-7 text-[11px]">
              <SelectValue placeholder="Idioma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              {availableLanguages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Has-variables toggle chip */}
        <button
          onClick={() => onHasVariablesChange(!hasVariables)}
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all',
            hasVariables
              ? 'border-primary/30 bg-primary-soft text-primary'
              : 'border-border bg-muted text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          Tem variáveis
          {hasVariables && <X className="ml-1 h-3 w-3" />}
        </button>

        {/* Clear-all link */}
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
