'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { SettingsPanelHead } from './settings-panel-head';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';
import { WhatsappNumberList } from './whatsapp/whatsapp-number-list';
import { WhatsappConfigForm } from './whatsapp/whatsapp-config-form';
import { WhatsappRegistrationDiagnostic } from './whatsapp/whatsapp-registration-diagnostic';
import type { RegistrationProbe } from './whatsapp/whatsapp-registration-diagnostic';
import { WhatsappSetupInstructions } from './whatsapp/whatsapp-setup-instructions';

const MASKED_TOKEN = '••••••••••••••••';

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  // Multi-config state
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<WhatsAppConfigType[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [label, setLabel] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Per-config status tracking: configId -> { connected, statusMessage, resetReason }
  const [configStatuses, setConfigStatuses] = useState<
    Record<string, { connected: boolean; statusMessage: string; resetReason: string | null }>
  >({});

  // Registration probe state (for selected config)
  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  const [registrationProbe, setRegistrationProbe] = useState<RegistrationProbe | null>(null);

  // Disconnecting state
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const selectedConfig = configs.find((c) => c.id === selectedConfigId) ?? null;

  const isRegistered = Boolean(selectedConfig?.registered_at);
  const lastRegistrationError = selectedConfig?.last_registration_error ?? null;

  const fetchConfigs = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .order('connected_at', { ascending: false });

      if (error) {
        console.error('Failed to load configs:', error);
      }

      const loadedConfigs = data ?? [];
      setConfigs(loadedConfigs);

      // Health check via API (returns { numbers: [...] })
      if (loadedConfigs.length > 0) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (Array.isArray(payload.numbers)) {
            const statuses: Record<string, { connected: boolean; statusMessage: string; resetReason: string | null }> = {};
            for (const num of payload.numbers) {
              statuses[num.id] = {
                connected: num.connected ?? false,
                statusMessage: num.probe_error || '',
                resetReason: num.probe_error?.includes('decrypted') ? 'token_corrupted' : null,
              };
            }
            setConfigStatuses(statuses);
          }
        } catch (err) {
          console.error('Health check failed:', err);
        }
      } else {
        setConfigStatuses({});
      }
    } catch (err) {
      console.error('fetchConfigs error:', err);
      toast.error('Falha ao carregar configurações do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfigs(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfigs]);

  function resetForm() {
    setPhoneNumberId('');
    setWabaId('');
    setAccessToken('');
    setVerifyToken('');
    setPin('');
    setLabel('');
    setTokenEdited(false);
    setShowToken(false);
    setRegistrationProbe(null);
  }

  function openAddForm() {
    resetForm();
    setSelectedConfigId(null);
    setShowAddForm(true);
  }

  function openEditForm(configId: string) {
    const cfg = configs.find((c) => c.id === configId);
    if (!cfg) return;
    setSelectedConfigId(configId);
    setShowAddForm(false);
    setPhoneNumberId(cfg.phone_number_id || '');
    setWabaId(cfg.waba_id || '');
    setAccessToken(MASKED_TOKEN);
    setVerifyToken('');
    setPin('');
    setLabel(cfg.label || '');
    setTokenEdited(false);
    setShowToken(false);
    setRegistrationProbe(null);
  }

  function cancelForm() {
    setSelectedConfigId(null);
    setShowAddForm(false);
    resetForm();
  }

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('ID do número de telefone é obrigatório');
      return;
    }
    const isEditing = Boolean(selectedConfig);
    if (!isEditing && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Token de acesso é obrigatório para configuração inicial');
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
        label: label.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (isEditing) {
        toast.error('Reinsira o Token de acesso para salvar as alterações');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar configuração');
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `Salvo, mas o Meta não conseguiu registrar o número: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        toast.success(
          'Credenciais salvas e verificadas. O registro de entrada foi ignorado (sem PIN). Veja o Status de registro abaixo.',
          { duration: 10000 },
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Ativo. ${data.phone_info.verified_name} agora pode receber eventos.`
            : 'WhatsApp conectado. Os eventos começarão a chegar em instantes.',
        );
        setPin('');
      }

      // Close form and refresh list
      setSelectedConfigId(null);
      setShowAddForm(false);
      resetForm();
      if (accountId) await fetchConfigs(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Falha ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(configId: string) {
    if (!confirm('Desconectar este número? O histórico de conversas será preservado.')) {
      return;
    }

    try {
      setDisconnectingId(configId);
      const res = await fetch('/api/whatsapp/config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: configId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao desconectar número');
        return;
      }

      toast.success('Número desconectado.');
      if (accountId) await fetchConfigs(accountId);
    } catch (err) {
      console.error('Disconnect error:', err);
      toast.error('Falha ao desconectar número');
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleVerifyRegistration() {
    if (!selectedConfigId) return;
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch(
        `/api/whatsapp/config/verify-registration?config_id=${selectedConfigId}`,
        { method: 'GET' },
      );
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('O número está totalmente conectado. O Meta está entregando eventos.');
      } else {
        toast.error(
          'O número não está totalmente registrado. Veja abaixo qual etapa falhou.',
          { duration: 8000 },
        );
      }
      if (accountId) await fetchConfigs(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Não foi possível acessar o endpoint de verificação.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada para a área de transferência');
  }

  const isFormOpen = showAddForm || selectedConfigId !== null;

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Conexão WhatsApp"
          description="Conecte sua API do Meta WhatsApp Business. Credenciais, webhook e instruções de configuração ficam aqui."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Conexão WhatsApp"
        description="Conecte sua API do Meta WhatsApp Business. Credenciais, webhook e instruções de configuração ficam aqui."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main area */}
        <div className="space-y-6">
          {/* Number list */}
          {!isFormOpen && (
            <WhatsappNumberList
              configs={configs}
              configStatuses={configStatuses}
              onEdit={openEditForm}
              onVerify={(configId) => {
                setSelectedConfigId(configId);
                handleVerifyRegistration();
              }}
              onDisconnect={handleDisconnect}
              disconnectingId={disconnectingId}
              onAdd={openAddForm}
            />
          )}

          {/* Add / Edit form */}
          {isFormOpen && (
            <>
              {/* Registration Status — shown when editing an existing config */}
              {selectedConfig && (
                <WhatsappRegistrationDiagnostic
                  probe={registrationProbe}
                  verifying={verifyingRegistration}
                  onVerify={handleVerifyRegistration}
                  isRegistered={isRegistered}
                  lastRegistrationError={lastRegistrationError}
                  registeredAt={selectedConfig.registered_at}
                />
              )}

              <WhatsappConfigForm
                phoneNumberId={phoneNumberId}
                setPhoneNumberId={setPhoneNumberId}
                wabaId={wabaId}
                setWabaId={setWabaId}
                accessToken={accessToken}
                setAccessToken={setAccessToken}
                verifyToken={verifyToken}
                setVerifyToken={setVerifyToken}
                pin={pin}
                setPin={setPin}
                label={label}
                setLabel={setLabel}
                tokenEdited={tokenEdited}
                setTokenEdited={setTokenEdited}
                showToken={showToken}
                setShowToken={setShowToken}
                saving={saving}
                isEditing={Boolean(selectedConfig)}
                onSave={handleSave}
                onCancel={cancelForm}
                webhookUrl={webhookUrl}
                onCopyWebhookUrl={handleCopyWebhookUrl}
              />
            </>
          )}
        </div>

        {/* Setup Instructions Sidebar */}
        <WhatsappSetupInstructions webhookUrl={webhookUrl} />
      </div>
    </section>
  );
}
