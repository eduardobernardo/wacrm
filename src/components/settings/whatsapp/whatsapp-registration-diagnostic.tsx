'use client';

import {
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export type RegistrationProbe = {
  live: boolean;
  checks: Record<string, boolean | null>;
  errors?: string[];
  last_registration_error?: string | null;
  registered_at?: string | null;
  subscribed_apps_at?: string | null;
};

export interface RegistrationDiagnosticProps {
  probe: RegistrationProbe | null;
  verifying: boolean;
  onVerify: () => void;
  isRegistered: boolean;
  lastRegistrationError: string | null;
  registeredAt?: string | null;
}

export function WhatsappRegistrationDiagnostic({
  probe,
  verifying,
  onVerify,
  isRegistered,
  lastRegistrationError,
  registeredAt,
}: RegistrationDiagnosticProps) {
  return (
    <Alert
      className={
        isRegistered
          ? 'bg-emerald-950/30 border-emerald-700/50'
          : 'bg-amber-950/30 border-amber-700/50'
      }
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isRegistered ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="size-4 text-amber-400" />
          )}
          <AlertTitle
            className={
              'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')
            }
          >
            {isRegistered
              ? 'Registrado. O Meta entregará eventos ao wacrm'
              : 'Não registrado. O Meta não entregará eventos'}
          </AlertTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onVerify}
          disabled={verifying}
          className="border-border bg-transparent text-foreground hover:bg-muted h-7"
        >
          {verifying ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Zap className="size-3.5" />
          )}
          Verificar com Meta
        </Button>
      </div>
      <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {isRegistered ? (
          <>
            Inscrito desde{' '}
            {registeredAt
              ? new Date(registeredAt).toLocaleString()
              : 'desconhecido'}
            . Clique em <strong>Verificar com Meta</strong> se os eventos
            pararem de chegar.
          </>
        ) : lastRegistrationError ? (
          <>
            Última tentativa falhou com:{' '}
            <span className="text-red-300">
              &quot;{lastRegistrationError}&quot;
            </span>
            . Insira (ou corrija) o PIN de verificação em 2 etapas abaixo e
            clique em Salvar configuração para tentar novamente.
          </>
        ) : (
          <>
            Este número foi salvo antes do rastreamento de registro
            existir, ou o registro foi ignorado. Insira o PIN de
            verificação em 2 etapas abaixo e clique em Salvar
            configuração para inscrevê-lo.
          </>
        )}
      </AlertDescription>

      {probe && (
        <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
          <p className="font-medium text-foreground">
            Diagnóstico. Última execução:{' '}
            <span className={probe.live ? 'text-emerald-400' : 'text-amber-400'}>
              {probe.live ? 'ativo' : 'não ativo'}
            </span>
          </p>
          <ul className="space-y-0.5 text-muted-foreground">
            {Object.entries(probe.checks).map(([k, v]) => (
              <li key={k} className="flex items-center gap-1.5">
                {v === true ? (
                  <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                ) : v === false ? (
                  <XCircle className="size-3 text-red-400 shrink-0" />
                ) : (
                  <span className="size-3 rounded-full border border-border shrink-0" />
                )}
                <code className="text-muted-foreground">{k}</code>
              </li>
            ))}
          </ul>
          {(probe.errors ?? []).length > 0 && (
            <ul className="pt-1 space-y-0.5 text-red-300">
              {probe.errors?.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Alert>
  );
}
