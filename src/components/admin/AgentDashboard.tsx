import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Bot,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  Sparkles,
  TrendingUp,
  Terminal,
  RefreshCw,
  Lightbulb,
  ExternalLink,
} from "lucide-react";

interface AttemptItem {
  id: string;
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  status: "success" | "pr_created" | "test_failed" | "lint_failed";
  hypothesis: string;
  lessonsLearned: string[];
  prUrl?: string;
  timestamp: string;
}

export default function AgentDashboard() {
  const [resolutionRate, setResolutionRate] = useState(83.3);
  const [totalAttempts, setTotalAttempts] = useState(6);
  const [successfulFixes, setSuccessfulFixes] = useState(5);
  const [failedFixes, setFailedFixes] = useState(1);
  const [lastRun, setLastRun] = useState<string>("Hoje às 03:00 (Agendamento Automático)");

  const [history, setHistory] = useState<AttemptItem[]>([
    {
      id: "att-1",
      issueNumber: 104,
      issueTitle: "Erro de arredondamento em moedas AOA no cálculo de troco",
      branchName: "test/agent-fix-issue-104",
      status: "pr_created",
      hypothesis: "Usar Math.round com precisão decimal em vez de truncamento direto",
      lessonsLearned: ["Moedas em AOA não utilizam frações decimais em operações em espécie"],
      prUrl: "https://github.com/empresa/gilpedidos/pull/12",
      timestamp: "2026-10-09 03:02",
    },
    {
      id: "att-2",
      issueNumber: 102,
      issueTitle: "Null pointer ao processar WhatsApp secundário vazio no catálogo",
      branchName: "test/agent-fix-issue-102",
      status: "pr_created",
      hypothesis: "Adicionar optional chaining (whatsapp_2?.trim()) antes da sanitização",
      lessonsLearned: ["Campos opcionais de contacto devem possuir sanitizador seguro com fallback null"],
      prUrl: "https://github.com/empresa/gilpedidos/pull/11",
      timestamp: "2026-10-08 03:05",
    },
    {
      id: "att-3",
      issueNumber: 99,
      issueTitle: "Filtro de categorias duplicava itens na renderização mobile",
      branchName: "test/agent-fix-issue-99",
      status: "test_failed",
      hypothesis: "Alterar chave do mapa para usar slug em vez de id",
      lessonsLearned: ["Alterar a chave quebrou testes unitários que esperavam id numérico. Sempre manter id."],
      timestamp: "2026-10-07 03:01",
    },
  ]);

  const patterns = [
    {
      category: "Manipulação de Moedas e Preços",
      strategy: "Validar tipos numéricos com fallback seguro para 0 antes da formatação",
      pitfall: "Não tentar converter strings com separador de milhar usando parseFloat direto",
    },
    {
      category: "Formulários e Inputs Opcionais",
      strategy: "Utilizar zod/resolvers com .nullable().optional() e sanitização com trim()",
      pitfall: "Evitar verificar apenas undefined; valores vazios chegam frequentemente como string vazia ''",
    },
    {
      category: "Rotas Públicas e Catálogo",
      strategy: "Consultar simultaneamente por ID e Slug com fallback gracioso",
      pitfall: "Não assumir que a coluna slug está sempre indexada ou populada",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border bg-gradient-to-r from-card to-muted/40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">Agente Autônomo de Bugs</h2>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                Autoaprimoramento Ativo
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Monitora o Issue Tracker diariamente, aprende com execuções e opera exclusivamente em branches de teste isoladas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 py-1 px-3">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Produção 100% Protegida</span>
          </Badge>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxa de Resolução */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Taxa de Resolução (Sucesso)
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">{resolutionRate}%</div>
            <div className="mt-3 space-y-1.5">
              <Progress value={resolutionRate} className="h-2" />
              <p className="text-xs text-muted-foreground">Métrica calculada sobre todas as tentativas</p>
            </div>
          </CardContent>
        </Card>

        {/* Total de Tentativas */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total de Tentativas
              </CardTitle>
              <Bot className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalAttempts}</div>
            <p className="text-xs text-muted-foreground mt-2">Bugs analisados no Issue Tracker</p>
          </CardContent>
        </Card>

        {/* Correções Aprovadas com PR */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Corrigidos com PR
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{successfulFixes}</div>
            <p className="text-xs text-muted-foreground mt-2">Passaram em linters e testes unitários</p>
          </CardContent>
        </Card>

        {/* Falhas Revertidas com Segurança */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Reversões Seguras
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{failedFixes}</div>
            <p className="text-xs text-muted-foreground mt-2">Revertidos antes do commit para não quebrar testes</p>
          </CardContent>
        </Card>
      </div>

      {/* Histórico e Autoaprimoramento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Tentativas */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-primary" />
                  Histórico de Resoluções & PRs
                </CardTitle>
                <CardDescription>
                  Cada correção é realizada em uma branch de teste descartável e validada por testes automatizados.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg border bg-card/60 hover:bg-muted/30 transition-colors space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Issue #{item.issueNumber}:</span>
                    <span className="text-sm font-medium">{item.issueTitle}</span>
                  </div>
                  {item.status === "pr_created" ? (
                    <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> PR Criado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <XCircle className="h-3 w-3" /> Testes Falharam (Revertido)
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{item.branchName}</code>
                  </span>
                  <span>{item.timestamp}</span>
                </div>

                <div className="text-xs bg-muted/50 p-2.5 rounded-md border text-muted-foreground space-y-1">
                  <div>
                    <strong className="text-foreground">Hipótese testada:</strong> {item.hypothesis}
                  </div>
                  {item.lessonsLearned.length > 0 && (
                    <div className="flex items-start gap-1.5 pt-1 text-emerald-700 dark:text-emerald-400">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>Lição aprendida:</strong> {item.lessonsLearned[0]}
                      </span>
                    </div>
                  )}
                </div>

                {item.prUrl && (
                  <div className="pt-1">
                    <a
                      href={item.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                    >
                      <span>Ver Pull Request no GitHub</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Base de Autoaprimoramento */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Memória & Padrões Aprendidos
            </CardTitle>
            <CardDescription>
              O agente consulta este repositório de conhecimento antes de formular hipóteses de correção.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {patterns.map((p, idx) => (
              <div key={idx} className="p-3 rounded-lg border bg-muted/40 space-y-2 text-xs">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {p.category}
                </div>
                <div className="space-y-1 pl-3.5">
                  <p className="text-emerald-700 dark:text-emerald-400">
                    <strong>✓ Estratégia recomendada:</strong> {p.strategy}
                  </p>
                  <p className="text-rose-600 dark:text-rose-400">
                    <strong>✗ Evitar (quebrou antes):</strong> {p.pitfall}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Como Executar e Agendamento Diário */}
      <Card className="shadow-sm border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Comandos de Execução e Automação Diária
          </CardTitle>
          <CardDescription>
            O agente pode ser executado manualmente ou através do GitHub Actions já configurado em{" "}
            <code>.github/workflows/daily-bug-fixer.yml</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs space-y-2">
              <div className="text-zinc-400"># Executar o agente de autoaprimoramento agora:</div>
              <div className="text-emerald-400 font-bold">$ npm run agent:run</div>
              <div className="text-zinc-400 pt-2"># Ver estatísticas e taxa de resolução:</div>
              <div className="text-emerald-400 font-bold">$ npm run agent:stats</div>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30 text-xs space-y-2">
              <div className="font-semibold text-foreground">Regras de Segurança Integradas:</div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>
                  <strong>Branch Protegida:</strong> Todo o trabalho acontece em <code>test/agent-fix-issue-*</code>.
                </li>
                <li>
                  <strong>Reversão Automática:</strong> Se os testes falharem após tentativas de adaptação, o código é
                  revertido e etiquetado como <code>agent-needs-human-review</code>.
                </li>
                <li>
                  <strong>Aprovação Humana:</strong> Apenas Pull Requests são abertos; merge direto em produção é
                  estritamente proibido.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
