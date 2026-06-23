'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { RouteTarget } from '@/lib/departments/types';
import type { Department, AccountMember } from '@/types';

// ── Routing mode labels ───────────────────────────────────────────
const ROUTING_MODES = [
  { value: 'none', label: 'Nenhum' },
  { value: 'department_auto', label: 'Departamento (auto)' },
  { value: 'department_sequential', label: 'Departamento (sequencial)' },
  { value: 'department_user', label: 'Departamento + usuário específico' },
  { value: 'user', label: 'Usuário específico' },
] as const;

type RoutingMode = (typeof ROUTING_MODES)[number]['value'];

interface ReplyRoutingSelectorProps {
  value: Record<string, unknown> | null | undefined;
  onChange: (value: Record<string, unknown> | null) => void;
}

export function ReplyRoutingSelector({ value, onChange }: ReplyRoutingSelectorProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Derive initial mode + ids from the JSONB value
  const [mode, setMode] = useState<RoutingMode>(() => deriveMode(value));
  const [departmentId, setDepartmentId] = useState<string>(
    (value as RouteTarget | null)?.kind === 'department'
      ? (value as { department_id: string }).department_id
      : (value as RouteTarget | null)?.kind === 'department_user'
        ? (value as { department_id: string }).department_id
        : '',
  );
  const [userId, setUserId] = useState<string>(
    (value as RouteTarget | null)?.kind === 'department_user'
      ? (value as { user_id: string }).user_id
      : (value as RouteTarget | null)?.kind === 'user'
        ? (value as { user_id: string }).user_id
        : '',
  );

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [deptRes, memberRes] = await Promise.all([
          fetch('/api/departments'),
          fetch('/api/account/members'),
        ]);
        const deptData = await deptRes.json();
        const memberData = await memberRes.json();
        setDepartments(deptData.departments ?? deptData ?? []);
        setMembers(memberData.members ?? memberData ?? []);
      } catch {
        // Silently degrade — empty selectors
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Emit the RouteTarget JSONB whenever selection changes
  useEffect(() => {
    const target = buildTarget(mode, departmentId, userId);
    onChange(target);
    // Only re-emit when the user changes the selection, not when
    // parent re-renders. mode/departmentId/userId are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, departmentId, userId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading routing options…
      </div>
    );
  }

  // Members of the selected department (for department_user mode)
  const deptMembers = departmentId
    ? members.filter((m) =>
        // We don't have a direct department→member mapping from the
        // /api/account/members endpoint. The user_id is what matters
        // for the RouteTarget; the department_id is validated server-side
        // by applyRouting. Show all account members here.
        true,
      )
    : [];

  return (
    <div className="space-y-3">
      <Label className="text-foreground">
        Quando o cliente responder, encaminhar para…
      </Label>

      {/* Mode selector */}
      <Select value={mode} onValueChange={(v) => { if (v) setMode(v as RoutingMode); }}>
        <SelectTrigger className="w-full border-border bg-muted text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-border bg-popover">
          {ROUTING_MODES.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Department selector (visible for department modes) */}
      {(mode === 'department_auto' ||
        mode === 'department_sequential' ||
        mode === 'department_user') && (
        <Select
          value={departmentId}
          onValueChange={(v) => { if (v) setDepartmentId(v); }}
        >
          <SelectTrigger className="w-full border-border bg-muted text-foreground">
            {/* Resolve the label explicitly so the trigger never shows
                the raw UUID before / after the list has hydrated. */}
            <SelectValue placeholder="Selecionar departamento…">
              {departments.find((d) => d.id === departmentId)?.name ?? ''}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            {departments.length === 0 ? (
              <SelectItem value="__none" disabled>
                Nenhum departamento encontrado
              </SelectItem>
            ) : (
              departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}

      {/* User selector (visible for user and department_user modes) */}
      {(mode === 'user' || mode === 'department_user') && (
        <Select value={userId} onValueChange={(v) => { if (v) setUserId(v); }}>
          <SelectTrigger className="w-full border-border bg-muted text-foreground">
            {/* Same explicit-label pattern as the department select. */}
            <SelectValue placeholder="Selecionar membro…">
              {members.find((m) => m.user_id === userId)?.full_name
                ?? members.find((m) => m.user_id === userId)?.email
                ?? ''}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            {members.length === 0 ? (
              <SelectItem value="__none" disabled>
                Nenhum membro encontrado
              </SelectItem>
            ) : (
              members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email || m.user_id}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function deriveMode(value: Record<string, unknown> | null | undefined): RoutingMode {
  if (!value || typeof value !== 'object') return 'none';
  const kind = (value as RouteTarget).kind;
  if (kind === 'department') {
    const strategy = (value as { strategy: string }).strategy;
    return strategy === 'sequential' ? 'department_sequential' : 'department_auto';
  }
  if (kind === 'department_user') return 'department_user';
  if (kind === 'user') return 'user';
  return 'none';
}

function buildTarget(
  mode: RoutingMode,
  departmentId: string,
  userId: string,
): Record<string, unknown> | null {
  if (mode === 'none') return null;
  if (mode === 'department_auto' && departmentId) {
    return { kind: 'department', department_id: departmentId, strategy: 'auto' };
  }
  if (mode === 'department_sequential' && departmentId) {
    return { kind: 'department', department_id: departmentId, strategy: 'sequential' };
  }
  if (mode === 'department_user' && departmentId && userId) {
    return { kind: 'department_user', department_id: departmentId, user_id: userId };
  }
  if (mode === 'user' && userId) {
    return { kind: 'user', user_id: userId };
  }
  return null;
}
