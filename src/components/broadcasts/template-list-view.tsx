'use client';

import { cn } from '@/lib/utils';
import type { MessageTemplate } from '@/types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplateListViewProps {
  templates: MessageTemplate[];
  selectedTemplateId: string | null;
  onSelect: (template: MessageTemplate) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const categoryColor: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400',
  Utility: 'bg-blue-500/10 text-blue-400',
  Authentication: 'bg-orange-500/10 text-orange-400',
};

const qualityDot: Record<string, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-rose-500',
};

function slugToDisplayName(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function countVariables(bodyText: string): number {
  return (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Dense table view of templates. Columns:
 *   Prévia (truncated body snippet) ·
 *   Nome (display name + slug) ·
 *   Categoria (pill badge) ·
 *   Idioma ·
 *   Vars (count) ·
 *   Qualidade (coloured dot)
 *
 * Clicking a row selects the template (same contract as the card grid).
 */
export function TemplateListView({
  templates,
  selectedTemplateId,
  onSelect,
}: TemplateListViewProps) {
  if (templates.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Prévia</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead className="w-[100px]">Categoria</TableHead>
            <TableHead className="w-[70px]">Idioma</TableHead>
            <TableHead className="w-[50px]">Vars</TableHead>
            <TableHead className="w-[32px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            const displayName = slugToDisplayName(template.name);
            const varCount = countVariables(template.body_text);
            const cat = categoryColor[template.category] ?? categoryColor.Utility;

            return (
              <TableRow
                key={template.id}
                onClick={() => onSelect(template)}
                className={cn(
                  'cursor-pointer',
                  isSelected
                    ? 'bg-primary-soft hover:bg-primary-soft'
                    : 'hover:bg-card-2',
                )}
              >
                {/* Body text preview — truncated single-line */}
                <TableCell>
                  <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                    {template.body_text}
                  </p>
                </TableCell>

                {/* Name + slug */}
                <TableCell>
                  <p className="text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {template.name}
                  </p>
                </TableCell>

                {/* Category pill */}
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      cat,
                    )}
                  >
                    {template.category}
                  </span>
                </TableCell>

                {/* Language */}
                <TableCell className="text-xs text-muted-foreground">
                  {template.language ?? 'en_US'}
                </TableCell>

                {/* Variable count */}
                <TableCell className="text-xs text-muted-foreground">
                  {varCount}
                </TableCell>

                {/* Quality dot */}
                <TableCell>
                  {template.quality_score && (
                    <span
                      title={template.quality_score}
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        qualityDot[template.quality_score],
                      )}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
