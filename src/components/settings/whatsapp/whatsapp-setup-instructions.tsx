'use client';

import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

interface WhatsappSetupInstructionsProps {
  webhookUrl: string;
}

export function WhatsappSetupInstructions({ webhookUrl }: WhatsappSetupInstructionsProps) {
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground text-base">Instruções de configuração</CardTitle>
          <CardDescription className="text-muted-foreground">
            Siga estes passos para conectar sua API do WhatsApp Business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion>
            <AccordionItem className="border-border">
              <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                  Criar um App Meta
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Acesse <span className="text-primary">developers.facebook.com</span></li>
                  <li>Clique em &quot;My Apps&quot; e depois em &quot;Create App&quot;</li>
                  <li>Selecione &quot;Business&quot; como tipo de app</li>
                  <li>Preencha os dados e crie o app</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem className="border-border">
              <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                  Adicionar produto WhatsApp
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>No painel do app, clique em &quot;Add Product&quot;</li>
                  <li>Encontre &quot;WhatsApp&quot; e clique em &quot;Set Up&quot;</li>
                  <li>Siga o assistente para vincular seu negócio</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem className="border-border">
              <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                  Obter credenciais da API
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Acesse WhatsApp &gt; API Setup</li>
                  <li>Copie seu <strong className="text-foreground">Phone Number ID</strong></li>
                  <li>Copie seu <strong className="text-foreground">WhatsApp Business Account ID</strong></li>
                  <li>Gere um <strong className="text-foreground">Permanent Access Token</strong> em Business Settings &gt; System Users</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem className="border-border">
              <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                  Configurar webhooks
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Acesse WhatsApp &gt; Configuration</li>
                  <li>Clique em &quot;Edit&quot; na seção Webhook</li>
                  <li>Cole a <strong className="text-foreground">URL de callback do webhook</strong> acima</li>
                  <li>Insira o mesmo <strong className="text-foreground">Verify Token</strong> que você definiu aqui</li>
                  <li>Inscreva-se no campo de webhook &quot;messages&quot;</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-4 pt-4 border-t border-border">
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="size-3.5" />
              Documentação da API WhatsApp do Meta
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
