'use client';

import type { TemplateSampleValues } from '@/types';

interface ChatBubblePreviewProps {
  bodyText: string;
  headerContent?: string;
  footerText?: string;
  sampleValues?: TemplateSampleValues;
}

/**
 * Parses body_text for `{{N}}` placeholders and renders them as inline
 * pill-shaped tokens. When `sampleValues.body` supplies a value for a
 * given index, the token displays the real sample text in a muted style;
 * otherwise it shows the raw `{{N}}` placeholder in a primary-tinted
 * pill so users can see which slots need filling in step 3.
 */
function renderVariableTokens(
  text: string,
  sampleValues?: TemplateSampleValues,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{\{(\d+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text segment before this placeholder
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const varIndex = parseInt(match[1], 10) - 1;
    const sample = sampleValues?.body?.[varIndex];

    if (sample !== undefined && sample !== null && sample !== '') {
      parts.push(
        <span
          key={`var-${match.index}`}
          className="mx-0.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
        >
          {sample}
        </span>,
      );
    } else {
      parts.push(
        <span
          key={`var-${match.index}`}
          className="mx-0.5 inline-flex items-center rounded-md bg-primary-soft px-1.5 py-0.5 font-mono text-[10px] text-primary"
        >
          {'{{'}
          {match[1]}
          {'}}'}
        </span>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Trailing text after the last placeholder
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * A WhatsApp-style chat bubble rendered inside the dark UI.
 *
 * Uses a subdued teal tint (not full WhatsApp green) so it feels
 * native but doesn't shout against the oklch dark background.
 * Variable placeholders appear as round pill tokens that keep
 * their position mid-sentence — the bubble still reads naturally.
 */
export function ChatBubblePreview({
  bodyText,
  headerContent,
  footerText,
  sampleValues,
}: ChatBubblePreviewProps) {
  return (
    <div className="max-w-[280px] rounded-2xl rounded-bl-md bg-teal-500/20 px-3 py-2 dark:bg-teal-500/15">
      {headerContent && (
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {headerContent}
        </p>
      )}
      <p className="text-xs leading-relaxed text-foreground/90 break-words">
        {renderVariableTokens(bodyText, sampleValues)}
      </p>
      {footerText && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {footerText}
        </p>
      )}
    </div>
  );
}
