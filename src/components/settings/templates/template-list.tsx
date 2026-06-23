'use client';

import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from '../settings-panel-head';
import type { MessageTemplate } from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import { categoryColors } from './template-form-types';

export interface TemplateListProps {
  templates: MessageTemplate[];
  loading: boolean;
  onEdit: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
  onSync: () => void;
  syncing: boolean;
  onCreate: () => void;
  deletingId: string | null;
}

export function TemplateList({
  templates,
  loading,
  onEdit,
  onDelete,
  onSync,
  syncing,
  onCreate,
  deletingId,
}: TemplateListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <SettingsPanelHead
        title="Modelos de mensagem"
        description={
          'Crie modelos e envie ao Meta para aprovação. Use "Sincronizar do Meta" para baixar modelos aprovados em outro lugar.'
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onSync}
              disabled={syncing}
              title="Baixar modelos aprovados da sua conta Meta WhatsApp Business"
            >
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar do Meta'}
            </Button>
            <Button onClick={onCreate}>
              <Plus className="size-4" />
              Novo modelo
            </Button>
          </div>
        }
      />

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground text-sm">Nenhum modelo ainda.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Crie seu primeiro modelo de mensagem para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {templates.map((template) => {
            const statusKey = template.status || 'DRAFT';
            const status = templateStatusConfig[statusKey];
            return (
              <Card key={template.id}>
                <CardContent className="flex items-start justify-between pt-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground">{template.name}</h3>
                      <Badge
                        className={`text-xs border ${categoryColors[template.category] || ''}`}
                      >
                        {template.category}
                      </Badge>
                      <Badge className={`text-xs border ${status.classes}`}>
                        {status.label}
                      </Badge>
                      {template.language && (
                        <span className="text-xs text-muted-foreground uppercase">
                          {template.language}
                        </span>
                      )}
                      {template.quality_score && (
                        <span
                          className={`text-[10px] uppercase font-medium ${
                            template.quality_score === 'GREEN'
                              ? 'text-emerald-400'
                              : template.quality_score === 'YELLOW'
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}
                          title="Pontuação de qualidade do Meta"
                        >
                          {template.quality_score}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.body_text}
                    </p>
                    {template.footer_text && (
                      <p className="text-xs text-muted-foreground italic">
                        {template.footer_text}
                      </p>
                    )}
                    {(template.rejection_reason || template.submission_error) && (
                      <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded px-2 py-1.5">
                        <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                        <span>
                          {template.rejection_reason || template.submission_error}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {statusKey === 'APPROVED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(template)}
                        title="Editar aciona reavaliação do Meta - o status muda para PENDENTE."
                        aria-label="Editar modelo"
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 px-2"
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    )}
                    {(statusKey === 'REJECTED' || statusKey === 'PAUSED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(template)}
                        title="Editar o modelo e reenviar ao Meta para avaliação."
                        aria-label="Editar e reenviar modelo"
                        className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 px-2"
                      >
                        <RotateCcw className="size-3.5" />
                        Reenviar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(template)}
                      disabled={deletingId === template.id}
                      aria-label={
                        template.meta_template_id
                          ? 'Excluir modelo do Meta e localmente'
                          : 'Excluir modelo localmente'
                      }
                      title={
                        template.meta_template_id
                          ? 'Excluir do Meta e localmente'
                          : 'Excluir localmente'
                      }
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-950/30 h-8 w-8"
                    >
                      {deletingId === template.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
