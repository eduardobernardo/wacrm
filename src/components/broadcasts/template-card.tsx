'use client';

import { cn } from '@/lib/utils';
import type { MessageTemplate } from '@/types';
import { ChatBubblePreview } from './chat-bubble-preview';

interface TemplateCardProps {
  template: MessageTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const categoryStripe: Record<string, string> = {
  Marketing: 'border-l-purple-500',
  Utility: 'border-l-blue-500',
  Authentication: 'border-l-orange-500',
};

const qualityDot: Record<string, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-rose-500',
};

const qualityLabel: Record<string, string> = {
  GREEN: 'Alta',
  YELLOW: 'Média',
  RED: 'Baixa',
};

/** Turn a Meta slug like "sample_movie_ticket_confirmation" into
 *  "Sample Movie Ticket Confirmation". */
function slugToDisplayName(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function countVariables(bodyText: string): number {
  return (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * A template-picker card whose visual center is the WhatsApp chat
 * bubble the customer will receive. Category is signalled by a 3px
 * left-edge colour stripe (thickens to 4px when selected) instead of
 * a floating badge — the slug-vs-badge overlap is gone because the
 * slug is demoted to micro-meta beneath a human-readable title.
 */
export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const displayName = slugToDisplayName(template.name);
  const stripe = categoryStripe[template.category] ?? categoryStripe.Utility;
  const varCount = countVariables(template.body_text);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-3 rounded-xl text-left transition-all border',
        stripe,
        isSelected
          ? 'border-primary/40 bg-primary-soft ring-1 ring-primary/30 border-l-[4px]'
          : 'border-border bg-card/50 hover:bg-card-2 border-l-[3px]',
      )}
    >
      {/* Title + slug */}
      <div className="px-4 pt-4">
        <h3 className="text-sm font-medium leading-snug text-foreground">
          {displayName}
        </h3>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {template.name}
        </p>
      </div>

      {/* The signature element — rendered WhatsApp bubble */}
      <div className="px-4">
        <ChatBubblePreview
          bodyText={template.body_text}
          headerContent={template.header_content}
          footerText={template.footer_text}
          sampleValues={template.sample_values}
        />
      </div>

      {/* Meta row: language · quality · variable count */}
      <div className="flex items-center gap-3 px-4 pb-4 text-[10px] text-muted-foreground">
        <span>{template.language ?? 'en_US'}</span>

        {template.quality_score && (
          <span className="inline-flex items-center gap-1">
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                qualityDot[template.quality_score],
              )}
            />
            {qualityLabel[template.quality_score]}
          </span>
        )}

        {varCount > 0 && (
          <span className="text-primary">
            {varCount} {varCount === 1 ? 'variável' : 'variáveis'}
          </span>
        )}
      </div>
    </button>
  );
}
