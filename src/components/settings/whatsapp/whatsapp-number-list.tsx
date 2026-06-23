'use client';

import {
  Loader2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Pencil,
  MoreVertical,
  Phone,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

export interface WhatsappNumberListProps {
  configs: WhatsAppConfigType[];
  configStatuses: Record<string, { connected: boolean; statusMessage: string; resetReason: string | null }>;
  onEdit: (configId: string) => void;
  onVerify: (configId: string) => void;
  onDisconnect: (configId: string) => void;
  disconnectingId: string | null;
  onAdd: () => void;
}

function formatPhone(phoneNumberId: string): string {
  // Best-effort: phone_number_id is a numeric Meta ID, not an E.164.
  // We just display it as-is; label takes priority when available.
  return phoneNumberId;
}

export function WhatsappNumberList({
  configs,
  configStatuses,
  onEdit,
  onVerify,
  onDisconnect,
  disconnectingId,
  onAdd,
}: WhatsappNumberListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Números conectados</CardTitle>
            <CardDescription className="text-muted-foreground">
              {configs.length === 0
                ? 'Nenhum número configurado ainda.'
                : `${configs.filter((c) => c.status === 'connected').length} de ${configs.length} conectado(s)`}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={onAdd}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            Conectar novo número
          </Button>
        </div>
      </CardHeader>
      {configs.length > 0 && (
        <CardContent>
          <ul className="divide-y divide-border">
            {configs.map((cfg) => {
              const status = configStatuses[cfg.id];
              const isConnected = cfg.status === 'connected' && (status?.connected ?? true);
              const hasResetIssue = status?.resetReason === 'token_corrupted';

              return (
                <li
                  key={cfg.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Phone className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {cfg.label || formatPhone(cfg.phone_number_id)}
                      </p>
                      {cfg.label && (
                        <p className="text-xs text-muted-foreground truncate">
                          {formatPhone(cfg.phone_number_id)}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        isConnected
                          ? 'border-emerald-600 bg-emerald-950/40 text-emerald-400 text-[10px] shrink-0'
                          : 'border-border bg-muted text-muted-foreground text-[10px] shrink-0'
                      }
                    >
                      {isConnected ? 'conectado' : 'desconectado'}
                    </Badge>
                    {hasResetIssue && (
                      <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(cfg.id)}
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                        <MoreVertical className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onEdit(cfg.id)}
                        >
                          <Pencil className="size-3.5 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onVerify(cfg.id)}
                        >
                          <Zap className="size-3.5 mr-2" />
                          Verificar registro
                        </DropdownMenuItem>
                        {cfg.status === 'connected' && (
                          <DropdownMenuItem
                            onClick={() => onDisconnect(cfg.id)}
                            disabled={disconnectingId === cfg.id}
                            className="text-red-400 focus:text-red-300"
                          >
                            {disconnectingId === cfg.id ? (
                              <Loader2 className="size-3.5 mr-2 animate-spin" />
                            ) : (
                              <RotateCcw className="size-3.5 mr-2" />
                            )}
                            Desconectar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
