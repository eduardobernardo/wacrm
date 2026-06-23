'use client';

// ============================================================
// DepartmentMembersDialog — manage members of a specific department
//
// Lists current department members with remove capability (admin+)
// and a searchable list of all account members that aren't yet in
// the department, with one-click add.
//
// Surfaces the department's color identity in the dialog header so
// the user is never in doubt which department they're managing.
//
// Uses the same fetch + optimistic-UI + presence patterns as
// MembersTab. Email is gated behind admin+ via the API (same as
// GET /api/account/members), so non-admins get a name-only row.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Search, UserPlus, Users, X } from 'lucide-react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import { canManageDepartments } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { stylesFor, type DepartmentColor } from '@/lib/departments/colors';

// ---------- types ----------

interface DepartmentMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface AccountMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

interface DepartmentMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  departmentName: string;
  departmentColor: DepartmentColor;
}

// ---------- component ----------

export function DepartmentMembersDialog({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  departmentColor,
}: DepartmentMembersDialogProps) {
  const { accountRole } = useAuth();
  const canManage = accountRole ? canManageDepartments(accountRole) : false;
  const { getPresence } = usePresence();

  const [deptMembers, setDeptMembers] = useState<DepartmentMember[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const styles = stylesFor(departmentColor);

  // ---- data fetching ----

  const loadData = useCallback(async () => {
    try {
      const [deptRes, acctRes] = await Promise.all([
        fetch(`/api/departments/${departmentId}/members`, { cache: 'no-store' }),
        fetch('/api/account/members', { cache: 'no-store' }),
      ]);

      if (!deptRes.ok) {
        const payload = await deptRes.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao carregar membros do departamento');
        return;
      }
      if (!acctRes.ok) {
        const payload = await acctRes.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao carregar membros da conta');
        return;
      }

      const deptData = (await deptRes.json()) as { members: DepartmentMember[] };
      const acctData = (await acctRes.json()) as { members: AccountMember[] };

      setDeptMembers(deptData.members ?? []);
      setAccountMembers(acctData.members);
    } catch (err) {
      console.error('[DepartmentMembersDialog] load error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setSearch('');
      void loadData();
    }
  }, [open, loadData]);

  // Filtered available members (account members not yet in department).
  // Search matches name or email (case-insensitive). Empty search = all.
  const availableMembers = useMemo(() => {
    const deptIds = new Set(deptMembers.map((m) => m.user_id));
    const base = accountMembers.filter((m) => !deptIds.has(m.user_id));
    const needle = search.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((m) => {
      const name = m.full_name?.toLowerCase() ?? '';
      const email = m.email?.toLowerCase() ?? '';
      return name.includes(needle) || email.includes(needle);
    });
  }, [accountMembers, deptMembers, search]);

  // ---- handlers ----

  async function handleAdd(userId: string) {
    setAddingUserId(userId);
    const member = accountMembers.find((m) => m.user_id === userId);
    if (!member) {
      setAddingUserId(null);
      return;
    }

    // Optimistic: add to dept members immediately.
    const optimistic: DepartmentMember = {
      user_id: member.user_id,
      full_name: member.full_name,
      email: member.email,
      avatar_url: member.avatar_url,
    };
    setDeptMembers((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/departments/${departmentId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        setDeptMembers((prev) => prev.filter((m) => m.user_id !== userId));
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao adicionar membro');
        return;
      }
      toast.success(
        `${member.full_name || 'Membro'} adicionado ao departamento`,
      );
    } catch (err) {
      setDeptMembers((prev) => prev.filter((m) => m.user_id !== userId));
      console.error('[DepartmentMembersDialog] add error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setAddingUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setRemovingUserId(userId);
    const member = deptMembers.find((m) => m.user_id === userId);
    const prev = deptMembers;

    setDeptMembers((curr) => curr.filter((m) => m.user_id !== userId));

    try {
      const res = await fetch(`/api/departments/${departmentId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        setDeptMembers(prev);
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Falha ao remover membro');
        return;
      }
      toast.success(
        `${member?.full_name || 'Membro'} removido do departamento`,
      );
    } catch (err) {
      setDeptMembers(prev);
      console.error('[DepartmentMembersDialog] remove error:', err);
      toast.error('Não foi possível acessar o servidor');
    } finally {
      setRemovingUserId(null);
    }
  }

  // ---- render ----

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-popover-foreground">
            <span
              aria-hidden
              className={cn('inline-block size-2.5 shrink-0 rounded-full', styles.dot)}
            />
            Membros — {departmentName}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Selecione os membros da conta que atendem por este
            departamento. As conversas do departamento aparecem para
            eles no inbox.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Current members */}
            <section>
              <header className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Users className="size-3.5" />
                  Membros atuais
                </h4>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                    styles.chipBg,
                    styles.chipFg,
                  )}
                >
                  {deptMembers.length}
                </span>
              </header>
              {deptMembers.length === 0 ? (
                <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  Nenhum membro neste departamento ainda.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {deptMembers.map((member) => (
                      <MemberRow
                        key={member.user_id}
                        member={member}
                        status={getPresence(member.user_id)}
                        action={
                          canManage ? (
                          <RequireRole min="admin">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemove(member.user_id)}
                              disabled={removingUserId === member.user_id}
                              aria-label={`Remover ${member.full_name || 'membro'}`}
                              className="h-7 w-7 shrink-0 border-red-500/40 bg-red-500/10 p-0 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                            >
                              {removingUserId === member.user_id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <X className="size-3.5" />
                              )}
                            </Button>
                          </RequireRole>
                        ) : null
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* Add member — search + list */}
            {canManage && accountMembers.length > deptMembers.length && (
              <section>
                <header className="mb-2 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <UserPlus className="size-3.5" />
                    Adicionar membro
                  </h4>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {availableMembers.length} disponíveis
                  </span>
                </header>

                <div className="relative mb-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={search}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setSearch(e.target.value)
                    }
                    placeholder="Buscar por nome ou email"
                    className="bg-muted border-border pl-8 text-foreground placeholder:text-muted-foreground"
                    aria-label="Buscar membros"
                  />
                </div>

                {availableMembers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    {search.trim()
                      ? 'Nenhum membro corresponde à busca.'
                      : 'Todos os membros da conta já estão neste departamento.'}
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {availableMembers.map((member) => (
                      <MemberRow
                        key={member.user_id}
                        member={member}
                        status={getPresence(member.user_id)}
                        action={
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAdd(member.user_id)}
                            disabled={addingUserId === member.user_id}
                            aria-label={`Adicionar ${member.full_name || 'membro'}`}
                            className="h-7 w-7 shrink-0 border-border p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {addingUserId === member.user_id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Plus className="size-3.5" />
                            )}
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {canManage &&
              availableMembers.length === 0 &&
              deptMembers.length > 0 &&
              !search.trim() && (
                <p className="text-center text-xs text-muted-foreground">
                  Todos os membros da conta já estão neste departamento.
                </p>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- shared row (current member + available member) ----------

function MemberRow({
  member,
  status,
  action,
}: {
  member: DepartmentMember | AccountMember;
  status: 'online' | 'away' | 'offline' | undefined;
  action: React.ReactNode;
}) {
  const initial = (member.full_name || member.email || 'U')
    .charAt(0)
    .toUpperCase();
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="relative shrink-0">
        <Avatar className="size-7">
          {member.avatar_url ? (
            <AvatarImage
              src={member.avatar_url}
              alt={member.full_name || 'Membro'}
            />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {initial}
          </AvatarFallback>
        </Avatar>
        {status ? (
          <PresenceDot
            status={status}
            className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-popover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {member.full_name || 'Sem nome'}
        </p>
        {member.email ? (
          <p className="truncate text-xs text-muted-foreground">
            {member.email}
          </p>
        ) : null}
      </div>
      {action}
    </li>
  );
}

// Local wrapper so we can use the same PresenceDot component as the
// roster in MembersTab without re-importing it everywhere.
import { PresenceDot } from '@/components/presence/presence-dot';
