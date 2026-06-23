"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import type { RouteTarget, RouteStrategy } from "@/lib/departments/types";
import type { Department } from "@/types";

interface DepartmentMember {
  user_id: string;
  full_name: string | null;
}

interface AccountMember {
  user_id: string;
  full_name: string;
}

type TransferMode = "department" | "user";

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onTransferred?: () => void;
}

export function TransferDialog({
  open,
  onOpenChange,
  conversationId,
  onTransferred,
}: TransferDialogProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptMembers, setDeptMembers] = useState<DepartmentMember[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);

  const [mode, setMode] = useState<TransferMode>("department");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [strategy, setStrategy] = useState<RouteStrategy>("auto");
  const [selectedDeptMemberId, setSelectedDeptMemberId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingDeptMembers, setLoadingDeptMembers] = useState(false);
  const [loadingAccountMembers, setLoadingAccountMembers] = useState(false);

  // Fetch departments on mount / open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDepts(true);

    fetch("/api/departments")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDepartments(data.departments ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load departments");
      })
      .finally(() => {
        if (!cancelled) setLoadingDepts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch department members when a department is selected
  useEffect(() => {
    if (!selectedDeptId) {
      setDeptMembers([]);
      return;
    }
    let cancelled = false;
    setLoadingDeptMembers(true);

    fetch(`/api/departments/${selectedDeptId}/members`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDeptMembers(data.members ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load department members");
      })
      .finally(() => {
        if (!cancelled) setLoadingDeptMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDeptId]);

  // Fetch account members when mode is "user"
  useEffect(() => {
    if (mode !== "user") return;
    let cancelled = false;
    setLoadingAccountMembers(true);

    fetch("/api/account/members")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAccountMembers(data.members ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load account members");
      })
      .finally(() => {
        if (!cancelled) setLoadingAccountMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Reset selections when switching modes
  useEffect(() => {
    setSelectedDeptId("");
    setSelectedDeptMemberId("");
    setSelectedUserId("");
  }, [mode]);

  // Reset dept member selection when department changes
  useEffect(() => {
    setSelectedDeptMemberId("");
  }, [selectedDeptId]);

  const handleSubmit = useCallback(async () => {
    let target: RouteTarget;

    if (mode === "department") {
      if (!selectedDeptId) {
        toast.error("Selecione um departamento");
        return;
      }
      if (selectedDeptMemberId) {
        target = {
          kind: "department_user",
          department_id: selectedDeptId,
          user_id: selectedDeptMemberId,
        };
      } else {
        target = {
          kind: "department",
          department_id: selectedDeptId,
          strategy,
        };
      }
    } else {
      if (!selectedUserId) {
        toast.error("Selecione um usuário");
        return;
      }
      target = { kind: "user", user_id: selectedUserId };
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      toast.success("Conversa transferida com sucesso");
      onTransferred?.();
      onOpenChange(false);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao transferir: ${reason}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    selectedDeptId,
    selectedDeptMemberId,
    selectedUserId,
    strategy,
    conversationId,
    onTransferred,
    onOpenChange,
  ]);

  const canSubmit =
    mode === "department" ? !!selectedDeptId : !!selectedUserId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transferir conversa
          </DialogTitle>
          <DialogDescription>
            Transfira esta conversa para um departamento ou usuário específico.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Mode toggle */}
          <div className="grid gap-2">
            <Label>Destino</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as TransferMode)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="department" id="mode-dept" />
                <Label htmlFor="mode-dept" className="font-normal cursor-pointer">
                  Departamento
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="user" id="mode-user" />
                <Label htmlFor="mode-user" className="font-normal cursor-pointer">
                  Usuário específico
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Department mode */}
          {mode === "department" && (
            <>
              <div className="grid gap-2">
                <Label>Departamento</Label>
                <Select
                  value={selectedDeptId}
                  onValueChange={(v) => setSelectedDeptId(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    {/* Resolve the label explicitly so the trigger never
                        shows the raw UUID when the list is loading or
                        the user clears the selection. */}
                    <SelectValue
                      placeholder={
                        loadingDepts
                          ? "Carregando..."
                          : "Selecione um departamento"
                      }
                    >
                      {departments.find(
                        (d) => d.id === selectedDeptId,
                      )?.name ?? ''}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy toggle — only when no specific member selected */}
              {selectedDeptId && !selectedDeptMemberId && (
                <div className="grid gap-2">
                  <Label>Estratégia</Label>
                  <RadioGroup
                    value={strategy}
                    onValueChange={(v) => setStrategy(v as RouteStrategy)}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="auto" id="strat-auto" />
                      <Label htmlFor="strat-auto" className="font-normal cursor-pointer">
                        Auto
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="sequential"
                        id="strat-seq"
                      />
                      <Label
                        htmlFor="strat-seq"
                        className="font-normal cursor-pointer"
                      >
                        Sequencial
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Optional: pick a specific department member */}
              {selectedDeptId && (
                <div className="grid gap-2">
                  <Label>Membro específico (opcional)</Label>
                  <Select
                    value={selectedDeptMemberId}
                    onValueChange={(v) => setSelectedDeptMemberId(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          loadingDeptMembers
                            ? "Carregando..."
                            : "Nenhum (usar estratégia)"
                        }
                      >
                        {deptMembers.find(
                          (m) => m.user_id === selectedDeptMemberId,
                        )?.full_name ?? ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {deptMembers.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name || m.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* User mode */}
          {mode === "user" && (
            <div className="grid gap-2">
              <Label>Usuário</Label>
              <Select
                value={selectedUserId}
                onValueChange={(v) => setSelectedUserId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingAccountMembers
                        ? "Carregando..."
                        : "Selecione um usuário"
                    }
                  >
                    {accountMembers.find(
                      (m) => m.user_id === selectedUserId,
                    )?.full_name ?? ''}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accountMembers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
