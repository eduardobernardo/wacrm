'use client';

import {
  Eye,
  EyeOff,
  Copy,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const MASKED_TOKEN = '••••••••••••••••';

export interface WhatsappConfigFormProps {
  // Form state + setters
  phoneNumberId: string;
  setPhoneNumberId: (v: string) => void;
  wabaId: string;
  setWabaId: (v: string) => void;
  accessToken: string;
  setAccessToken: (v: string) => void;
  verifyToken: string;
  setVerifyToken: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  tokenEdited: boolean;
  setTokenEdited: (v: boolean) => void;
  showToken: boolean;
  setShowToken: (v: boolean) => void;
  saving: boolean;
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
  webhookUrl: string;
  onCopyWebhookUrl: () => void;
}

export function WhatsappConfigForm({
  phoneNumberId,
  setPhoneNumberId,
  wabaId,
  setWabaId,
  accessToken,
  setAccessToken,
  verifyToken,
  setVerifyToken,
  pin,
  setPin,
  label,
  setLabel,
  tokenEdited,
  setTokenEdited,
  showToken,
  setShowToken,
  saving,
  isEditing,
  onSave,
  onCancel,
  webhookUrl,
  onCopyWebhookUrl,
}: WhatsappConfigFormProps) {
  return (
    <>
      {/* API Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">
            {isEditing ? 'Editar número' : 'Conectar novo número'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isEditing
              ? 'Atualize as credenciais deste número WhatsApp.'
              : 'Insira as credenciais da API do Meta WhatsApp Business.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Rótulo (opcional)</Label>
            <Input
              placeholder="Ex: Suporte, Vendas"
              maxLength={30}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Um nome curto para identificar este número na lista.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">ID do número de telefone</Label>
            <Input
              placeholder="ex: 100234567890123"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">ID da conta WhatsApp Business</Label>
            <Input
              placeholder="ex: 100234567890456"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Token de acesso permanente</Label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="Insira seu token de acesso"
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value);
                  setTokenEdited(true);
                }}
                onFocus={() => {
                  if (accessToken === MASKED_TOKEN) {
                    setAccessToken('');
                    setTokenEdited(true);
                  }
                }}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {isEditing && !tokenEdited && (
              <p className="text-xs text-muted-foreground">
                Token oculto por segurança. Reinsira-o para atualizar a configuração.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Token de verificação do webhook</Label>
            <Input
              placeholder="Crie um token de verificação personalizado"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Uma string personalizada que você cria. Deve corresponder ao token definido nas configurações de webhook do Meta.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              PIN de verificação em 2 etapas
              <span className="ml-1 text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN de 6 dígitos do Meta WhatsApp Manager"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Necessário apenas para configurar mensagens <strong className="text-muted-foreground">de entrada</strong>
              de um número <strong className="text-muted-foreground">de produção</strong>. Defina em{' '}
              <strong className="text-muted-foreground">
                Meta Business Manager → WhatsApp Accounts → Phone
                Numbers → Two-step verification
              </strong>
              , depois cole aqui para que o wacrm possa inscrever o número.
              Caso contrário, o Meta roteia eventos de entrada para o app
              que registrou por último.{' '}
              <strong className="text-muted-foreground">Números de teste do Meta</strong> não têm
              PIN e são pré-registrados. Deixe em branco para eles.
              Deixar em branco também mantém um registro existente
              inalterado.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Configuração do webhook</CardTitle>
          <CardDescription className="text-muted-foreground">
            Use esta URL como callback do webhook no painel do Meta App.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="text-muted-foreground">URL de callback do webhook</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="bg-muted border-border text-muted-foreground font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={onCopyWebhookUrl}
                className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar configuração'
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          Cancelar
        </Button>
      </div>
    </>
  );
}
