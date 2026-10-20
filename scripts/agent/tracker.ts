import fs from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import type { Issue } from "./types.js";

const MOCK_ISSUES_FILE = path.resolve(process.cwd(), ".agent/mock-issues.json");

export class IssueTracker {
  private octokit: Octokit | null = null;
  private owner = "";
  private repo = "";

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    const repoSlug = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY;

    if (token && repoSlug && repoSlug.includes("/")) {
      const [owner, repo] = repoSlug.split("/");
      this.owner = owner;
      this.repo = repo;
      this.octokit = new Octokit({ auth: token });
      console.log(`[IssueTracker] Conectado ao GitHub: ${this.owner}/${this.repo}`);
    } else {
      console.log(
        "[IssueTracker] GITHUB_TOKEN ou GITHUB_REPO não configurado. Modo de simulação local ativado."
      );
    }
  }

  /**
   * Obtém lista de bugs pendentes para o agente resolver
   */
  public async getPendingBugs(limit = 3): Promise<Issue[]> {
    if (this.octokit) {
      try {
        const { data } = await this.octokit.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: "open",
          labels: "bug",
          per_page: limit,
        });

        // Filtrar apenas issues normais (excluir PRs que a API de issues também lista)
        return data
          .filter((i) => !i.pull_request)
          .map((i) => ({
            id: i.id,
            number: i.number,
            title: i.title,
            body: i.body || "",
            labels: i.labels.map((l) => (typeof l === "string" ? l : l.name || "")),
            html_url: i.html_url,
            state: i.state as "open" | "closed",
          }));
      } catch (err: any) {
        console.error(`[IssueTracker] Erro ao listar issues do GitHub: ${err.message}`);
      }
    }

    // Modo local / Fallback para testes
    return this.loadMockIssues(limit);
  }

  /**
   * Comenta no Issue com atualizações de progresso ou diagnóstico
   */
  public async postComment(issueNumber: number, comment: string): Promise<void> {
    console.log(`\n💬 [Issue #${issueNumber}] Comentário:\n${comment}\n`);
    if (this.octokit) {
      try {
        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          body: comment,
        });
      } catch (err: any) {
        console.warn(`[IssueTracker] Aviso ao comentar no issue #${issueNumber}: ${err.message}`);
      }
    }
  }

  /**
   * Adiciona etiquetas de status ao Issue
   */
  public async setStatusLabel(issueNumber: number, label: string): Promise<void> {
    if (this.octokit) {
      try {
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          labels: [label],
        });
      } catch (err: any) {
        console.warn(`[IssueTracker] Aviso ao adicionar label ${label}: ${err.message}`);
      }
    }
  }

  /**
   * Cria o Pull Request com a correção validada na branch de teste
   */
  public async createPullRequest(
    branchName: string,
    issueNumber: number,
    title: string,
    body: string
  ): Promise<string> {
    if (this.octokit) {
      try {
        const { data: pr } = await this.octokit.pulls.create({
          owner: this.owner,
          repo: this.repo,
          title: `fix(issue-#${issueNumber}): ${title}`,
          head: branchName,
          base: "main",
          body: `${body}\n\nCloses #${issueNumber}\n\n*Gerado automaticamente pelo Agente de Autoaprimoramento de Bugs.*`,
        });

        console.log(`[IssueTracker] 🚀 Pull Request criado com sucesso: ${pr.html_url}`);
        return pr.html_url;
      } catch (err: any) {
        console.error(`[IssueTracker] Erro ao criar Pull Request: ${err.message}`);
      }
    }

    const simulatedUrl = `https://github.com/${this.owner || "local"}/${this.repo || "repo"}/pull/simulated-${issueNumber}`;
    console.log(`[IssueTracker] 🚀 [Simulado] Pull Request registrado para a branch: ${branchName}`);
    return simulatedUrl;
  }

  /**
   * Cria issues mock para testes locais
   */
  private loadMockIssues(limit: number): Issue[] {
    if (fs.existsSync(MOCK_ISSUES_FILE)) {
      try {
        const raw = fs.readFileSync(MOCK_ISSUES_FILE, "utf-8");
        const list: Issue[] = JSON.parse(raw);
        return list.filter((i) => i.state === "open").slice(0, limit);
      } catch { /* ignore */ }
    }

    // Criar issue mock padrão de exemplo se não existir
    const defaultMocks: Issue[] = [
      {
        id: 101,
        number: 101,
        title: "Erro ao formatar valores de moedas em pedidos sem casas decimais",
        body: "Ao formatar itens com valores inteiros, a função formatCurrency gera NaN quando o tipo não é numérico estrito.",
        labels: ["bug", "priority:medium"],
        html_url: "https://github.com/mock/repo/issues/101",
        state: "open",
      },
    ];

    try {
      const dir = path.dirname(MOCK_ISSUES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MOCK_ISSUES_FILE, JSON.stringify(defaultMocks, null, 2), "utf-8");
    } catch { /* ignore */ }

    return defaultMocks.slice(0, limit);
  }
}
