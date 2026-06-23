'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight } from 'lucide-react';
import { TemplateFilters } from './template-filters';
import { TemplateCard } from './template-card';
import { TemplateListView } from './template-list-view';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CategoryFilter = 'Marketing' | 'Utility' | 'Authentication';

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive a human-readable title from the Meta slug for display. */
function slugToDisplayName(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Step 1 of the broadcast wizard — template picker.
 *
 * The user chooses from pre-approved Meta templates. A filter bar
 * (search, category chips, language, has-variables toggle) narrows
 * the list. Two view modes are available:
 *
 *   Cards  – 2-column grid where each card is a rendered WhatsApp
 *            chat bubble (the customer's actual experience). Category
 *            is shown as a left-edge colour stripe instead of a
 *            floating badge, fixing the old slug-vs-badge overlap.
 *   List   – dense table with truncated preview, category pill,
 *            language, variable count, and quality dot.
 *
 * The component contract (`Step1Props`) is identical to the previous
 * version — the wizard page in `broadcasts/new/page.tsx` is untouched.
 */
export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  onNext,
  onBack,
}: Step1Props) {
  /* ---- data ---- */
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---- filter/view state ---- */
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<Set<CategoryFilter>>(
    new Set(),
  );
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [hasVariables, setHasVariables] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  /* ---- fetch ---- */
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        // Only APPROVED templates can be sent via Meta — anything else
        // would 400 at broadcast time. Hide them rather than letting
        // the user pick a template that will fail.
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates(data ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load templates',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  /* ---- derived: available languages ---- */
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const t of templates) {
      if (t.language) langs.add(t.language);
    }
    return Array.from(langs).sort();
  }, [templates]);

  /* ---- filtered list ---- */
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // Search: match against display name, raw slug, and body text.
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const displayName = slugToDisplayName(t.name).toLowerCase();
        if (
          !displayName.includes(q) &&
          !t.name.toLowerCase().includes(q) &&
          !t.body_text.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      // Category multi-select
      if (categoryFilters.size > 0 && !categoryFilters.has(t.category)) {
        return false;
      }

      // Language single-select
      if (languageFilter && t.language !== languageFilter) {
        return false;
      }

      // Has-variables toggle
      if (hasVariables && !/\{\{\d+\}\}/.test(t.body_text)) {
        return false;
      }

      return true;
    });
  }, [templates, searchQuery, categoryFilters, languageFilter, hasVariables]);

  /* ---- category toggle helper ---- */
  function toggleCategory(category: CategoryFilter) {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  /* ---- clear all filters ---- */
  function handleClearAllFilters() {
    setSearchQuery('');
    setCategoryFilters(new Set());
    setLanguageFilter(null);
    setHasVariables(false);
  }

  /* ---- loading state ---- */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  /* ---- error state ---- */
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Escolher um modelo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione um modelo de mensagem aprovado para seu disparo.
        </p>
      </div>

      {templates.length === 0 ? (
        /* Global empty — no templates at all */
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum modelo disponível.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie um modelo nas Configurações primeiro.
          </p>
        </div>
      ) : (
        <>
          {/* Filter bar + view toggle */}
          <TemplateFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            categoryFilters={categoryFilters}
            onCategoryToggle={toggleCategory}
            languageFilter={languageFilter}
            onLanguageChange={setLanguageFilter}
            hasVariables={hasVariables}
            onHasVariablesChange={setHasVariables}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            availableLanguages={availableLanguages}
          />

          {/* Results */}
          {filteredTemplates.length === 0 ? (
            /* Filtered empty — active filters returned nothing */
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
              <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum modelo encontrado
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tente ajustar os filtros
              </p>
              <button
                onClick={handleClearAllFilters}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          ) : viewMode === 'cards' ? (
            /* ---- Card grid (2 cols on desktop) ---- */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onSelect={() => onSelect(template)}
                />
              ))}
            </div>
          ) : (
            /* ---- List / table view ---- */
            <TemplateListView
              templates={filteredTemplates}
              selectedTemplateId={selectedTemplate?.id ?? null}
              onSelect={onSelect}
            />
          )}
        </>
      )}

      {/* Wizard footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          Voltar
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Próximo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
