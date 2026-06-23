'use client';

import { useMemo } from 'react';
import {
  Plus,
  Loader2,
  X,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MessageTemplate, TemplateButton } from '@/types';
import {
  extractVariableIndices,
  TEMPLATE_LIMITS,
} from '@/lib/whatsapp/template-validators';
import {
  CATEGORIES,
  HEADER_FORMATS,
  COMMON_LANGUAGE_CODES,
  emptyButton,
} from './template-form-types';
import type { HeaderFormat, TemplateFormState, WabaConfig } from './template-form-types';

export interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  // Form state
  form: TemplateFormState;
  onFormChange: (patch: Partial<TemplateFormState>) => void;
  // WABA selector
  wabaConfigs: WabaConfig[];
  selectedWabaConfigId: string | null;
  onWabaConfigChange: (id: string) => void;
  showNumberSelector: boolean;
  // Actions
  onSubmit: () => void;
  submitting: boolean;
  // Header image upload
  onHeaderImageUpload: (file: File) => void;
  uploadingHeader: boolean;
  headerFileRef: React.RefObject<HTMLInputElement | null>;
}

// The patch type unions every field across button variants. The
// conditional rendering below ensures only fields valid for the
// current button's `type` reach this function, so the runtime
// assertion + per-type spread preserves discriminated-union
// invariants without forcing every call site to thread the type
// through generics (which TS can't infer from a partial literal).
type ButtonPatch = {
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string;
};

export function TemplateFormDialog({
  open,
  onOpenChange,
  isEditing,
  form,
  onFormChange,
  wabaConfigs,
  selectedWabaConfigId,
  onWabaConfigChange,
  showNumberSelector,
  onSubmit,
  submitting,
  onHeaderImageUpload,
  uploadingHeader,
  headerFileRef,
}: TemplateFormDialogProps) {
  // Body variable indices — re-run on every render to keep the
  // sample-value rows in sync with what the user typed.
  const headerVarCount = useMemo(
    () =>
      form.header_format === 'text'
        ? extractVariableIndices(form.header_content).length
        : 0,
    [form.header_format, form.header_content],
  );

  const headerNeedsMedia =
    form.header_format !== 'none' && form.header_format !== 'text';

  function updateButton(index: number, patch: ButtonPatch) {
    const current = form.buttons[index];
    if (!current) return;
    const next = [...form.buttons];
    // Per-variant spread keeps the discriminant pinned. Switch
    // exhaustiveness is enforced by TypeScript.
    switch (current.type) {
      case 'QUICK_REPLY':
        next[index] = {
          ...current,
          ...(patch.text !== undefined && { text: patch.text }),
        };
        break;
      case 'URL':
        next[index] = {
          ...current,
          ...(patch.text !== undefined && { text: patch.text }),
          ...(patch.url !== undefined && { url: patch.url }),
          ...(patch.example !== undefined && { example: patch.example }),
        };
        break;
      case 'PHONE_NUMBER':
        next[index] = {
          ...current,
          ...(patch.text !== undefined && { text: patch.text }),
          ...(patch.phone_number !== undefined && {
            phone_number: patch.phone_number,
          }),
        };
        break;
      case 'COPY_CODE':
        next[index] = {
          ...current,
          ...(patch.text !== undefined && { text: patch.text }),
          ...(patch.example !== undefined && { example: patch.example }),
        };
        break;
    }
    onFormChange({ buttons: next });
  }

  function changeButtonType(index: number, type: TemplateButton['type']) {
    const next = [...form.buttons];
    next[index] = emptyButton(type);
    onFormChange({ buttons: next });
  }

  function removeButton(index: number) {
    onFormChange({ buttons: form.buttons.filter((_, i) => i !== index) });
  }

  function addButton() {
    if (form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal) return;
    onFormChange({ buttons: [...form.buttons, emptyButton('QUICK_REPLY')] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="bg-popover border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEditing ? 'Editar modelo de mensagem' : 'Novo modelo de mensagem'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing
              ? 'Salve suas alterações para reenviar ao Meta. O status voltará para PENDENTE durante a avaliação.'
              : 'Crie um modelo e envie ao Meta para aprovação. Uma vez aprovado, você pode usá-lo em disparos e na caixa de entrada.'}
          </DialogDescription>
        </DialogHeader>

        {form.category === 'Authentication' && (
          <div className="flex items-start gap-2 rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <p>
              Modelos de AUTENTICAÇÃO têm um formato fixo de corpo + botão OTP
              que precisa de um construtor diferente. Crie-os no Meta WhatsApp
              Manager por enquanto e use <strong>Sincronizar do Meta</strong> para
              trazê-los.
            </p>
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Nome do modelo</Label>
            <Input
              placeholder="ex: confirmacao_pedido"
              value={form.name}
              onChange={(e) => onFormChange({ name: e.target.value })}
              disabled={isEditing}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground">
              {isEditing
                ? 'O nome é fixo após o modelo existir no Meta - crie um novo modelo para alterá-lo.'
                : 'Apenas letras minúsculas, dígitos e underscores.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(val) =>
                  onFormChange({
                    category: val as MessageTemplate['category'],
                  })
                }
              >
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {CATEGORIES.map((cat) => (
                    <SelectItem
                      key={cat}
                      value={cat}
                      className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                    >
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Idioma</Label>
              <Input
                list="template-language-codes"
                placeholder="pt_BR"
                value={form.language}
                onChange={(e) =>
                  onFormChange({ language: e.target.value })
                }
                disabled={isEditing}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <datalist id="template-language-codes">
                {COMMON_LANGUAGE_CODES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">
                {isEditing
                  ? 'O idioma é fixo após o modelo existir no Meta.'
                  : (
                      <>
                        Deve corresponder ao código exato no Meta - <code>en_US</code>{' '}
                        e <code>en</code> são distintos.
                      </>
                    )}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Cabeçalho</Label>
            <Select
              value={form.header_format}
              onValueChange={(val) =>
                // Preserve header_content, header_media_url, and
                // header_sample across format switches. The submit
                // payload builder only reads the field that matches
                // the active format, so an orphan value on a hidden
                // field is harmless — and keeping it lets the user
                // switch formats to compare without losing typing.
                onFormChange({
                  header_format: (val || 'none') as HeaderFormat,
                })
              }
            >
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {HEADER_FORMATS.map((type) => (
                  <SelectItem
                    key={type}
                    value={type}
                    className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                  >
                    {type === 'none'
                      ? 'Nenhum'
                      : type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {form.header_format === 'text' && (
              <div className="space-y-2 mt-2">
                <Input
                  id="template-header-text"
                  aria-label="Texto do cabeçalho"
                  placeholder="Texto do cabeçalho (máx. 60 caracteres, opcional {{1}})"
                  value={form.header_content}
                  onChange={(e) =>
                    onFormChange({ header_content: e.target.value })
                  }
                  maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                {headerVarCount > 0 && (
                  <Input
                    id="template-header-sample"
                    aria-label="Valor de exemplo para variável do cabeçalho"
                    placeholder="Valor de exemplo para {{1}} (obrigatório para avaliação do Meta)"
                    value={form.header_sample}
                    onChange={(e) =>
                      onFormChange({ header_sample: e.target.value })
                    }
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                )}
              </div>
            )}

            {headerNeedsMedia && (
              <div className="space-y-2 mt-2">
                {form.header_format === 'image' && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={headerFileRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onHeaderImageUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingHeader}
                      onClick={() => headerFileRef.current?.click()}
                    >
                      {uploadingHeader ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Enviar imagem
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      JPEG or PNG, ≤5 MB
                    </span>
                  </div>
                )}
                <Input
                  placeholder={`https://… (ou cole um link público de ${form.header_format})`}
                  value={form.header_media_url}
                  onChange={(e) =>
                    onFormChange({ header_media_url: e.target.value })
                  }
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                {form.header_format === 'image' && form.header_media_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.header_media_url}
                    alt="Exemplo do cabeçalho"
                    className="max-h-28 rounded-md border border-border object-contain"
                  />
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {form.header_format === 'image'
                    ? 'Envie um JPEG/PNG (≤5 MB, ≥800×418 px recomendado) ou cole um link HTTPS público - fazemos o upload para o Meta automaticamente.'
                    : 'Deve ser um link HTTPS acessível publicamente. O Meta busca uma vez durante a avaliação, então precisa permanecer ativo por ~24 horas.'}
                  {form.header_format === 'video' &&
                    ' Recomendado: MP4 / 3GPP, ≤16 MB, ≤60 segundos.'}
                  {form.header_format === 'document' &&
                    ' Recomendado: PDF, ≤100 MB.'}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Texto do corpo</Label>
            <Textarea
              placeholder="Olá {{1}}, seu pedido {{2}} está confirmado."
              value={form.body_text}
              onChange={(e) =>
                onFormChange({ body_text: e.target.value })
              }
              rows={4}
              maxLength={TEMPLATE_LIMITS.bodyMaxLength}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Use {`{{1}}`}, {`{{2}}`} para variáveis (devem ser contíguas
              começando em {`{{1}}`}).
            </p>

            {form.body_samples.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <Label className="text-[11px] text-muted-foreground">
                  Valores de exemplo (o Meta usa estes para avaliar seu modelo)
                </Label>
                {form.body_samples.map((val, i) => {
                  const inputId = `template-body-sample-${i}`;
                  return (
                    <Input
                      key={i}
                      id={inputId}
                      aria-label={`Valor de exemplo para variável do corpo {{${i + 1}}}`}
                      placeholder={`Exemplo para {{${i + 1}}}`}
                      value={val}
                      onChange={(e) => {
                        const next = [...form.body_samples];
                        next[i] = e.target.value;
                        onFormChange({ body_samples: next });
                      }}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Rodapé (opcional)</Label>
            <Input
              placeholder="Texto de rodapé opcional (máx. 60 caracteres)"
              value={form.footer_text}
              onChange={(e) =>
                onFormChange({ footer_text: e.target.value })
              }
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">Botões (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal}
                className="border-border bg-transparent text-muted-foreground hover:bg-muted h-7 text-xs"
              >
                <Plus className="size-3" />
                Adicionar botão
              </Button>
            </div>
            {form.buttons.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Até {TEMPLATE_LIMITS.maxButtonsTotal} botões. Botões de RESPOSTA RÁPIDA
                devem vir antes de botões URL / telefone / copiar código.
              </p>
            ) : (
              <div className="space-y-2">
                {form.buttons.map((btn, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded border border-border bg-muted/50 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Select
                        value={btn.type}
                        onValueChange={(val) => {
                          // Same null guard as the Header Select
                          // (per PR 148): @base-ui Select fires
                          // onValueChange(null) on deselect.
                          if (!val) return;
                          changeButtonType(i, val as TemplateButton['type']);
                        }}
                      >
                        <SelectTrigger className="w-40 bg-muted border-border text-foreground h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          <SelectItem
                            value="QUICK_REPLY"
                            className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                          >
                            Resposta rápida
                          </SelectItem>
                          <SelectItem
                            value="URL"
                            className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                          >
                            URL
                          </SelectItem>
                          <SelectItem
                            value="PHONE_NUMBER"
                            className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                          >
                            Telefone
                          </SelectItem>
                          <SelectItem
                            value="COPY_CODE"
                            className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                          >
                            Copiar código
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Rótulo do botão"
                        value={btn.text}
                        maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                        onChange={(e) =>
                          updateButton(i, { text: e.target.value })
                        }
                        className="flex-1 bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeButton(i)}
                        className="text-muted-foreground hover:text-red-400 hover:bg-red-950/30 size-7"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    {btn.type === 'URL' && (
                      <div className="space-y-1 pl-1">
                        <Input
                          placeholder="https://exemplo.com/caminho ou com sufixo {{1}}"
                          value={btn.url}
                          onChange={(e) =>
                            updateButton(i, { url: e.target.value })
                          }
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                        {extractVariableIndices(btn.url).length > 0 && (
                          <Input
                            placeholder="Valor de exemplo para {{1}} (obrigatório quando a URL tem variável)"
                            value={btn.example ?? ''}
                            onChange={(e) =>
                              updateButton(i, { example: e.target.value })
                            }
                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                          />
                        )}
                      </div>
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                      <Input
                        placeholder="+5511999999999"
                        value={btn.phone_number}
                        onChange={(e) =>
                          updateButton(i, { phone_number: e.target.value })
                        }
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                      />
                    )}
                    {btn.type === 'COPY_CODE' && (
                      <Input
                        placeholder="Código de exemplo (ex: VERÃO20)"
                        value={btn.example}
                        onChange={(e) =>
                          updateButton(i, { example: e.target.value })
                        }
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showNumberSelector && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-muted-foreground">Enviar para</Label>
            <Select
              value={selectedWabaConfigId ?? undefined}
              onValueChange={(val) => {
                if (val) onWabaConfigChange(val);
              }}
            >
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue placeholder="Selecione um número" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {wabaConfigs.map((cfg) => (
                  <SelectItem
                    key={cfg.id}
                    value={cfg.id}
                    className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                  >
                    {cfg.label || cfg.phone_number_id || cfg.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || form.category === 'Authentication'}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isEditing ? 'Salvando...' : 'Enviando...'}
              </>
            ) : isEditing ? (
              'Salvar e reenviar'
            ) : (
              'Enviar para aprovação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
