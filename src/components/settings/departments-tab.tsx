'use client';

// ============================================================
// DepartmentsTab — Settings → Departments
//
// Lists every department in the account. Admin+ can create, edit,
// delete, and manage members. Each department carries a color
// swatch (5-curated palette) that re-appears in the inbox and the
// dialog headers, so the same department is recognisable across
// surfaces.
//
// Follows the same optimistic-UI pattern as MembersTab: optimistic
// mutation with revert on error, RequireRole gates for admin-only
// actions, SettingsPanelHead + Card primitives from the design
// system, SettingsChip for inline role/state pills.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { canManageDepartments } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import {
  DEPARTMENT_COLORS,
  DEPARTMENT_COLOR_LABELS,
  type DepartmentColor,
  stylesFor,
} from '@/lib/departments/colors';
import type { Department } from '@/types';
import { SettingsPanelHead } from './settings-panel-head';
import { DepartmentMembersDialog } from './department-members-dialog';

interface DepartmentRow extends Department {
  member_count?: number;
}

// ---------- color picker (used inside the create/edit dialog) ----------

function ColorPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: DepartmentColor;
  onChange: (c: DepartmentColor) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {DEPARTMENT_COLORS.map((c) => {
        const styles = stylesFor(c);
        const isSelected = c === value;
        return (
          <label
            key={c}
            className="group inline-flex cursor-pointer items-center gap-1.5"
          >
            <input
              type="radio"
              name={`${idPrefix}-color`}
              value={c}
              checked={isSelected}
              onChange={() => onChange(c)}
              className="sr-only"
              aria-label={DEPARTMENT_COLOR_LABELS[c]}
            />
            <span
              className={cn(
                'inline-flex size-6 items-center justify-center rounded-full transition-all',
                styles.dot,
                isSelected
                  ? cn('ring-2 ring-offset-2 ring-offset-popover', styles.ring)
                  : 'opacity-60 group-hover:opacity-100',
              )}
              aria-hidden
            />
            <span
              className={cn(
                'text-xs',
                isSelected
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            >
              {DEPARTMENT_COLOR_LABELS[c]}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------- form dialog (create + edit) ----------

function DepartmentFormDialog({
  open,
  onOpenChange,
  initialName,
  initialDescription,
  initialColor,
  submitLabel,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialDescription: string;
  initialColor: DepartmentColor;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: {
    name: string;
    description: string;
    color: DepartmentColor;
  }) => void;
}) {
  // Local state initialised from props on mount. The dialog is
  // keyed by the parent (`key={editing?.id ?? 'create'}` etc.) so
  // re-opening with different initial values remounts the form
  // cleanly — no useEffect / setState-in-effect required.
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDescription);
  const [color, setColor] = useState<DepartmentColor>(initialColor);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('O nome é obrigatório');
      return;
    }
    onSubmit({ name: trimmed, description: desc.trim(), color });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {submitLabel === 'Criar' ? 'Novo departamento' : 'Editar departamento'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              O nome identifica o departamento no inbox e nos fluxos de
              atendimento. A cor é a identidade visual usada em toda a
              aplicação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name" className="text-muted-foreground">
                Nome
              </Label>
              <Input
                id="dept-name"
                placeholder="Ex.: Suporte, Vendas, Cobrança"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-description" className="text-muted-foreground">
                Descrição{' '}
                <span className="text-xs font-normal text-muted-foreground/70">
                  (opcional)
                </span>
              </Label>
              <Input
                id="dept-description"
                placeholder="Função do departamento"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Cor de identidade</Label>
              <ColorPicker
                value={color}
                onChange={setColor}
                idPrefix={submitLabel === 'Criar' ? 'new' : 'edit'}
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- main tab ----------

export function DepartmentsTab() {
  const { accountRole } = useAuth();
  const canManage = accountRole ? canManageDepartments(accountRole) : false;

  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / edit / delete / members state.
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [membersDept, setMembersDept] = useState<DepartmentRow | null>(null);

  // ---- data fetching ----

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao carregar departamentos');
        return;
      }
      const data = (await res.json()) as { departments: DepartmentRow[] };
      setDepartments(data.departments);
    } catch (err) {
      console.error('[DepartmentsTab] load error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  // ---- CRUD handlers ----

  async function handleCreate(input: {
    name: string;
    description: string;
    color: DepartmentColor;
  }) {
    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
          color: input.color,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao criar departamento');
        return;
      }
      const data = (await res.json()) as { department: Department };
      setDepartments((prev) => [
        { ...data.department, member_count: 0 } as DepartmentRow,
        ...prev,
      ]);
      setCreateOpen(false);
      toast.success(`Departamento "${input.name}" criado`);
    } catch (err) {
      console.error('[DepartmentsTab] create error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleEdit(input: {
    name: string;
    description: string;
    color: DepartmentColor;
  }) {
    if (!editing) return;
    setEditSubmitting(true);
    const prev = departments;
    // Optimistic update.
    setDepartments((curr) =>
      curr.map((d) =>
        d.id === editing.id
          ? {
              ...d,
              name: input.name,
              description: input.description,
              color: input.color,
            }
          : d,
      ),
    );
    try {
      const res = await fetch(`/api/departments/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
          color: input.color,
        }),
      });
      if (!res.ok) {
        setDepartments(prev);
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao atualizar departamento');
        return;
      }
      setEditing(null);
      toast.success(`Departamento "${input.name}" atualizado`);
    } catch (err) {
      setDepartments(prev);
      console.error('[DepartmentsTab] edit error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    const prev = departments;
    setDepartments((curr) => curr.filter((d) => d.id !== deleting.id));
    try {
      const res = await fetch(`/api/departments/${deleting.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setDepartments(prev);
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao excluir departamento');
        return;
      }
      toast.success(`Departamento "${deleting.name}" excluído`);
      setDeleting(null);
    } catch (err) {
      setDepartments(prev);
      console.error('[DepartmentsTab] delete error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setDeletingBusy(false);
    }
  }

  // ---- render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Departamentos"
        description="Organize sua equipe em departamentos para facilitar a gestão e atribuição de atendimentos."
        action={
          <RequireRole min="admin">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Novo Departamento
            </Button>
          </RequireRole>
        }
      />

      {departments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
              <Building2 className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Nenhum departamento ainda
            </p>
            <p className="mt-1 max-w-[42ch] text-xs text-muted-foreground">
              Crie departamentos para organizar os membros da sua equipe por
              função ou área de atuação. Cada departamento ganha uma cor que
              o identifica no inbox e nos fluxos.
            </p>
            <RequireRole min="admin">
              <Button
                className="mt-5"
                onClick={() => setCreateOpen(true)}
                size="sm"
              >
                <Plus className="size-4" />
                Criar primeiro departamento
              </Button>
            </RequireRole>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {departments.map((dept) => {
                const styles = stylesFor(dept.color);
                return (
                  <li
                    key={dept.id}
                    className="group relative flex items-stretch gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    {/* Color swatch — left bar identifies the department
                        across surfaces without needing an icon. */}
                    <div
                      className={cn(
                        'w-1 shrink-0 self-stretch rounded-full',
                        styles.bar,
                      )}
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {dept.name}
                      </p>
                      {dept.description ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {dept.description}
                        </p>
                      ) : null}
                    </div>

                    {/* Member count — a chip that opens the members dialog.
                        The count and the action share a chip so the row
                        stays compact. */}
                    <button
                      type="button"
                      onClick={() => setMembersDept(dept)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 self-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        styles.chipBg,
                        styles.chipFg,
                        styles.border,
                        'hover:bg-muted/60',
                      )}
                    >
                      <Users className="size-3.5" />
                      <span>
                        {dept.member_count ?? 0}{' '}
                        {(dept.member_count ?? 0) === 1
                          ? 'membro'
                          : 'membros'}
                      </span>
                    </button>

                    {/* Actions — admin+ only. Always visible (matches the
                        members tab — destructive affordances should read
                        at a glance, not only on hover). */}
                    {canManage && (
                      <div className="flex items-center gap-1.5 self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(dept)}
                          aria-label={`Editar ${dept.name}`}
                          className="h-7 w-7 border-border p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleting(dept)}
                          aria-label={`Excluir ${dept.name}`}
                          className="h-7 w-7 border-red-500/40 bg-red-500/10 p-0 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Create dialog — keyed on open so re-opening remounts with a clean form */}
      <DepartmentFormDialog
        key={createOpen ? 'create-open' : 'create-closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName=""
        initialDescription=""
        initialColor="slate"
        submitLabel="Criar"
        submitting={createSubmitting}
        onSubmit={handleCreate}
      />

      {/* Edit dialog — keyed so it remounts with fresh initial values */}
      <DepartmentFormDialog
        key={editing?.id ?? 'edit-closed'}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initialName={editing?.name ?? ''}
        initialDescription={editing?.description ?? ''}
        initialColor={editing?.color ?? 'slate'}
        submitLabel="Salvar"
        submitting={editSubmitting}
        onSubmit={handleEdit}
      />

      {/* Delete confirmation — same single-button confirm as the
          members tab (not type-to-confirm, which would be a heavier
          guard for a less-destructive action than removing a member). */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-amber-400" />
              Excluir departamento
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Excluir o departamento{' '}
              <span className="font-medium text-foreground">
                {deleting?.name}
              </span>{' '}
              remove o vínculo das conversas. As conversas não são
              apagadas; voltam para a fila geral (visível apenas a
              admins). Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deletingBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deletingBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Excluindo…
                </>
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      {membersDept && (
        <DepartmentMembersDialog
          open={membersDept !== null}
          onOpenChange={(open: boolean) => {
            if (!open) setMembersDept(null);
          }}
          departmentId={membersDept.id}
          departmentName={membersDept.name}
          departmentColor={membersDept.color ?? 'slate'}
        />
      )}
    </section>
  );
}
