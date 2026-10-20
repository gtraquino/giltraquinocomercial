import { Link } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, Shield, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b pb-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Início</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span>Termos e Condições Oficiais</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            <FileText className="h-3.5 w-3.5" />
            <span>Condições de Utilização</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: Outubro de 2026. Leia atentamente as condições de utilização da plataforma GilPedidos.
          </p>
        </div>

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Uso Permitido & Transparência
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              A plataforma fornece infraestrutura tecnológica de catálogo e pedidos via WhatsApp para estabelecimentos comerciais independentes.
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Responsabilidade do Lojista
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Cada lojista é inteiramente responsável pela exatidão de preços, prazos de entrega, qualidade dos alimentos e emissão fiscal.
            </CardContent>
          </Card>
        </div>

        {/* Text */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">1. Aceitação dos Termos</h2>
            <p>
              Ao aceder, navegar ou utilizar qualquer funcionalidade do GilPedidos, você concorda expressamente em vincular-se a estes Termos de Uso e à nossa Política de Privacidade. Caso discorde de qualquer disposição, encerre o uso imediatamente.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">2. Escopo do Serviço</h2>
            <p>
              O GilPedidos é uma solução SaaS para apresentação de cardápios interativos, seleção de itens de consumo e formatação de pedidos direcionados aos canais de comunicação do estabelecimento (notadamente WhatsApp). A plataforma não atua como operadora financeira de pagamentos e não garante a disponibilidade física de estoques dos lojistas.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">3. Conduta Proibida e Segurança</h2>
            <p>
              É terminantemente proibido:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tentar descompilar, interceptar chaves de servidor, forçar ataques de injeção de prompt ou efetuar varreduras não autorizadas;</li>
              <li>Praticar sobrecarga ou abuso volumétrico (spam de requisições, scraping ou contorno do rate limiter);</li>
              <li>Cadastrar produtos ilícitos, prejudiciais à saúde pública ou violadores de propriedade intelectual;</li>
              <li>Acessar ou tentar acessar dados de lojas ou administradores terceiros.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">4. Limitação de Responsabilidade</h2>
            <p>
              O serviço é fornecido "no estado em que se encontra" (as is). Não nos responsabilizamos por perdas de lucros, atrasos na entrega das operadoras de mensageria ou indisponibilidades temporárias de rede decorrentes de causas fora do nosso controle razoável.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">5. Disposições Finais</h2>
            <p>
              Estes termos poderão ser atualizados periodicamente. Quaisquer modificações substanciais serão comunicadas nesta página.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
