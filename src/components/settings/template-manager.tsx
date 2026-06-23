'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type {
  MessageTemplate,
  TemplateSampleValues,
} from '@/types';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import {
  emptyForm,
  emptyButton,
} from './templates/template-form-types';
import type {
  HeaderFormat,
  TemplateFormState,
  WabaConfig,
} from './templates/template-form-types';
import { TemplateList } from './templates/template-list';
import { TemplateFormDialog } from './templates/template-form-dialog';

export function TemplateManager() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  // Non-null when the dialog is editing an existing row — switches the
  // submit handler from POST /submit to PATCH /[id] and changes the
  // dialog title + CTA. Set to the template id to pre-fill from a row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Template selected for the confirm-delete dialog. The destructive
  // action goes through this two-step so a slip on the trash icon
  // doesn't take the template off Meta as well as locally.
  const [templateToDelete, setTemplateToDelete] =
    useState<MessageTemplate | null>(null);
  // Header-image upload (issue #230). Uploads to the account-scoped
  // chat-media bucket and stores the public URL in header_media_url; the
  // submit route turns that into a Meta Resumable-Upload handle.
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);
  // Connected WhatsApp configs for the WABA number selector.
  const [wabaConfigs, setWabaConfigs] = useState<WabaConfig[]>([]);
  const [selectedWabaConfigId, setSelectedWabaConfigId] = useState<string | null>(null);

  // Body variable indices — `[1, 2, 3]` for "{{1}} {{2}} {{3}}". We
  // re-run the extractor on every render to keep the sample-value rows
  // in sync with what the user typed.
  const bodyVarCount = useMemo(
    () => extractVariableIndices(form.body_text).length,
    [form.body_text],
  );

  // Show the WABA number selector only if the account has multiple
  // connected configs with distinct waba_ids. Templates are shared
  // across numbers under the same WABA, so no selector needed there.
  const showNumberSelector = useMemo(() => {
    if (wabaConfigs.length <= 1) return false;
    const wabaIds = new Set(wabaConfigs.map((c) => c.waba_id).filter(Boolean));
    return wabaIds.size > 1;
  }, [wabaConfigs]);

  // Resize body_samples so it always has exactly bodyVarCount entries.
  // (We mutate via setForm in an effect so React owns the state.)
  useEffect(() => {
    setForm((prev) => {
      if (prev.body_samples.length === bodyVarCount) return prev;
      const next = prev.body_samples.slice(0, bodyVarCount);
      while (next.length < bodyVarCount) next.push('');
      return { ...prev, body_samples: next };
    });
  }, [bodyVarCount]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchTemplates(user.id);
    if (accountId) fetchWabaConfigs(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, accountId]);

  async function fetchWabaConfigs(acctId: string) {
    const { data } = await supabase
      .from('whatsapp_config')
      .select('id, label, phone_number_id, waba_id')
      .eq('account_id', acctId)
      .eq('status', 'connected')
      .order('label', { nullsFirst: false })
      .order('phone_number_id');
    if (data) {
      setWabaConfigs(data);
      // Default to first config.
      if (data.length > 0 && !selectedWabaConfigId) {
        setSelectedWabaConfigId(data[0].id);
      }
    }
  }

  async function fetchTemplates(userId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      toast.error('Falha ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }

  function buildSubmitPayload() {
    const sample_values: TemplateSampleValues = {};
    if (form.body_samples.some((v) => v.trim())) {
      sample_values.body = form.body_samples.map((v) => v.trim());
    }
    if (form.header_format === 'text' && form.header_sample.trim()) {
      sample_values.header = [form.header_sample.trim()];
    }

    return {
      name: form.name.trim(),
      category: form.category,
      language: form.language.trim() || 'en_US',
      header_type: form.header_format === 'none' ? undefined : form.header_format,
      header_content:
        form.header_format === 'text' ? form.header_content.trim() : undefined,
      header_media_url:
        form.header_format !== 'none' && form.header_format !== 'text'
          ? form.header_media_url.trim() || undefined
          : undefined,
      body_text: form.body_text.trim(),
      footer_text: form.footer_text.trim() || undefined,
      buttons: form.buttons.length > 0 ? form.buttons : undefined,
      sample_values:
        Object.keys(sample_values).length > 0 ? sample_values : undefined,
    };
  }

  function openEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language || 'en_US',
      header_format: (template.header_type ?? 'none') as HeaderFormat,
      header_content: template.header_content ?? '',
      header_media_url: template.header_media_url ?? '',
      header_sample: template.sample_values?.header?.[0] ?? '',
      body_text: template.body_text,
      body_samples: template.sample_values?.body ?? [],
      footer_text: template.footer_text ?? '',
      buttons: template.buttons ?? [],
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    // AUTHENTICATION is blocked by the persistent banner + disabled
    // submit button; this is a defensive second line of defense.
    if (form.category === 'Authentication') return;
    try {
      setSubmitting(true);
      const isEdit = editingId !== null;
      const url = isEdit
        ? `/api/whatsapp/templates/${editingId}`
        : '/api/whatsapp/templates/submit';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildSubmitPayload(),
          ...(showNumberSelector && selectedWabaConfigId
            ? { whatsapp_config_id: selectedWabaConfigId }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || `${isEdit ? 'Edição' : 'Envio'} falhou (HTTP ${res.status})`,
        );
      }
      // Refresh first, then close — re-opening the dialog
      // immediately should not show a stale list.
      if (user) await fetchTemplates(user.id);
      toast.success(
        data.dry_run
          ? isEdit
            ? 'Modelo atualizado (simulação - sem chamada ao Meta)'
            : 'Modelo salvo (simulação - sem chamada ao Meta)'
          : isEdit
            ? 'Edição enviada - o Meta avalia em até 24 horas.'
            : 'Enviado ao Meta - o tempo de avaliação é de 24 horas. O status é atualizado automaticamente.',
      );
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncFromMeta() {
    if (!user) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sincronização falhou (HTTP ${res.status})`);
      }
      toast.success(
        `Sincronizado ${data.total} modelo${data.total === 1 ? '' : 's'} do Meta` +
          (data.inserted || data.updated
            ? ` (${data.inserted} novo${data.inserted === 1 ? '' : 's'}, ${data.updated} atualizado${data.updated === 1 ? '' : 's'})`
            : ''),
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors.slice(0, 3).map(
          (e: { name: string; language: string; message: string }) =>
            `${e.name} (${e.language})`,
        );
        const suffix =
          data.errors.length > 3 ? `, +${data.errors.length - 3} mais` : '';
        toast.error(`Falha na sincronização: ${preview.join(', ')}${suffix}`);
      }
      if (data.truncated) {
        // Use error (not warning) so the message survives long
        // enough to read — sonner's `warning` auto-dismisses on
        // the same short timer as `success`.
        toast.error(
          'Apenas os primeiros 2000 modelos foram sincronizados - sua conta tem mais. Sincronize novamente para continuar, ou entre em contato com o suporte se isso persistir.',
          { duration: 10000 },
        );
      }
      await fetchTemplates(user.id);
    } catch (err) {
      console.error('Template sync error:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar modelos');
    } finally {
      setSyncing(false);
    }
  }

  async function confirmDelete() {
    const target = templateToDelete;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    try {
      // Route handler scopes the Meta delete via hsm_id (so sibling
      // language variants survive) and falls through to remove the
      // local row. Local-only rows skip the Meta call.
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Exclusão falhou (HTTP ${res.status})`);
      }
      toast.success('Modelo excluído');
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir modelo');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleHeaderImageFile(file: File) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('A imagem do cabeçalho deve ser JPEG ou PNG.');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error(
        `A imagem tem ${(file.size / 1024 / 1024).toFixed(1)} MB - o limite do Meta é 5 MB.`,
      );
      return;
    }
    setUploadingHeader(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setForm((f) => ({ ...f, header_media_url: publicUrl }));
      toast.success('Imagem enviada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no envio.');
    } finally {
      setUploadingHeader(false);
    }
  }

  return (
    <section className="animate-in fade-in-50 space-y-4 duration-200">
      <TemplateList
        templates={templates}
        loading={loading}
        onEdit={openEdit}
        onDelete={setTemplateToDelete}
        onSync={handleSyncFromMeta}
        syncing={syncing}
        onCreate={openCreate}
        deletingId={deletingId}
      />

      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(emptyForm);
          }
        }}
        isEditing={editingId !== null}
        form={form}
        onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        wabaConfigs={wabaConfigs}
        selectedWabaConfigId={selectedWabaConfigId}
        onWabaConfigChange={setSelectedWabaConfigId}
        showNumberSelector={showNumberSelector}
        onSubmit={handleSubmit}
        submitting={submitting}
        onHeaderImageUpload={handleHeaderImageFile}
        uploadingHeader={uploadingHeader}
        headerFileRef={headerFileRef}
      />

      {/* Confirm-delete dialog. Surfacing the meta_template_id case
          separately so users understand a real Meta delete is happening,
          not just a local cleanup. */}
      <Dialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Excluir modelo?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {templateToDelete?.meta_template_id
                ? `"${templateToDelete?.name}" será excluído do Meta e do wacrm. Disparos ativos que usam este modelo começarão a falhar no próximo envio. Isso não pode ser desfeito.`
                : `"${templateToDelete?.name}" será excluído do wacrm. Nunca foi enviado ao Meta, então nenhuma limpeza remota é necessária.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={deletingId !== null}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deletingId !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
