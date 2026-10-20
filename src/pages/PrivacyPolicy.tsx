import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft, Trash2, CheckCircle2, AlertTriangle, Lock, EyeOff, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function PrivacyPolicy() {
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);

  const handlePurgeRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast.error("Por favor, informe um email válido.");
      return;
    }

    if (confirmation.trim() !== "CONFIRMAR_EXCLUSAO") {
      toast.error('Digite exatamente "CONFIRMAR_EXCLUSAO" no campo de confirmação.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/privacy/purge-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          confirmation: "CONFIRMAR_EXCLUSAO",
          reason: reason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Falha ao processar solicitação.");
      }

      setProtocol(data.protocolNumber || `PURGE-${Date.now()}`);
      toast.success("Solicitação de eliminação de dados enviada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro de conexão ao solicitar eliminação de dados.");
    } finally {
      setLoading(false);
    }
  };

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
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span>Conexão Segura HTTPS & Isolamento Total</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            <Shield className="h-3.5 w-3.5" />
            <span>Privacidade & Proteção de Dados</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: Outubro de 2026. Em conformidade com o RGPD (Regulamento Geral sobre a Proteção de Dados) e a LGPD.
          </p>
        </div>

        {/* Core Principles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-primary" />
                Minimização de Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Coletamos apenas as informações estritamente necessárias para a emissão e encaminhamento do seu pedido via WhatsApp.
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-emerald-600" />
                Processamento no Servidor
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Recursos de IA e dados operacionais rodam exclusivamente em backend protegido. Nenhuma chave ou dado sensível transita no navegador.
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-600" />
                Criptografia em Trânsito
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Todo o tráfego é criptografado ponta a ponta com protocolos modernos TLS/HTTPS e políticas estritas de cabeçalhos de segurança.
            </CardContent>
          </Card>
        </div>

        {/* Policy Text */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">1. Informações Coletadas</h2>
            <p>
              Ao utilizar a plataforma GilPedidos como cliente, você pode fornecer dados de contato para o lojista (como nome, endereço de entrega e telefone para confirmação no WhatsApp). Como gestor ou administrador, armazenamos credenciais seguras e informações do estabelecimento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">2. Uso das Informações e Inteligência Artificial</h2>
            <p>
              Os dados de pedidos são utilizados única e exclusivamente para a finalização das compras diretamente com os estabelecimentos cadastrados. Ferramentas de inteligência artificial utilizadas na plataforma (como sugestões de descrição e cardápios) operam em servidores seguros, com parâmetros protegidos, e nunca utilizam dados pessoais de clientes para treinamento público de modelos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">3. Armazenamento e Segurança</h2>
            <p>
              Adotamos medidas rigorosas de isolamento entre lojistas (Row-Level Security), proteção contra ataques automatizados, rate limiting por IP e filtragem rigorosa de requisições. Chaves de API e credenciais de infraestrutura são mantidas exclusivamente no servidor seguro (Google Secret Manager) e nunca são disponibilizadas no cliente web.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-foreground">4. Direitos do Titular de Dados</h2>
            <p>
              Você possui o direito de confirmar a existência de tratamento, acessar seus dados, corrigir dados incompletos ou solicitar a eliminação definitiva dos seus dados dos nossos sistemas a qualquer momento.
            </p>
          </section>
        </div>

        {/* Self-service data deletion / GDPR Section */}
        <Card id="excluir-dados" className="border-destructive/30 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base text-foreground">Direito ao Esquecimento: Solicitar Exclusão de Dados</CardTitle>
            </div>
            <CardDescription>
              Utilize o formulário abaixo para solicitar a exclusão irrevogável de seus dados de usuário, histórico e registros associados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {protocol ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Solicitação registrada com sucesso!</span>
                </div>
                <p className="text-xs">
                  Número de protocolo de purga: <code className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-foreground">{protocol}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Seus dados foram agendados para expurgo completo dos registros nos termos da legislação aplicável.
                </p>
                <Button variant="outline" size="sm" onClick={() => setProtocol(null)} className="mt-2 text-xs">
                  Fazer nova solicitação
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePurgeRequest} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email da conta / pedido:</label>
                  <Input
                    type="email"
                    placeholder="seu-email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Confirmação de segurança: (digite exatamente <code className="text-destructive font-mono">CONFIRMAR_EXCLUSAO</code>)
                  </label>
                  <Input
                    type="text"
                    placeholder="CONFIRMAR_EXCLUSAO"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                    className="text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Motivo (opcional):</label>
                  <Input
                    type="text"
                    placeholder="Ex: Desejo encerrar minha conta"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Atenção: Esta ação é definitiva e removerá seus acessos, histórico e dados vinculados.
                  </span>
                </div>

                <Button type="submit" variant="destructive" disabled={loading} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  {loading ? "A processar..." : "Excluir Definitivamente Meus Dados"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
