import { execSync, execFileSync } from "node:child_process";
import type { ValidationResult } from "./types.js";

const PROTECTED_BRANCHES = ["main", "master", "production", "prod", "staging", "release"];

export class GitManager {
  private baseBranch: string;

  constructor(baseBranch = "main") {
    this.baseBranch = baseBranch;
  }

  private run(cmd: string): string {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  }

  public getCurrentBranch(): string {
    try {
      return this.run("git rev-parse --abbrev-ref HEAD");
    } catch {
      return "main";
    }
  }

  /**
   * Garantia Estrita de Segurança: Nunca trabalhar em branch de produção.
   */
  public assertBranchSafety(branchName: string): void {
    const normalized = branchName.toLowerCase().trim();
    if (PROTECTED_BRANCHES.includes(normalized)) {
      throw new Error(
        `[SEGURANÇA VIOLADA] O agente tentou operar diretamente na branch protegida "${branchName}". Operação abortada imediatamente!`
      );
    }
  }

  /**
   * Cria e alterna para a branch de teste isolada para o issue
   */
  public prepareTestBranch(issueNumber: number): string {
    const branchName = `test/agent-fix-issue-${issueNumber}`;
    this.assertBranchSafety(branchName);

    try {
      // 1. Verificar se o repositório git está inicializado
      try {
        this.run("git status");
      } catch {
        console.log("[Git] Repositório git não inicializado localmente ou em ambiente simulado.");
        return branchName;
      }

      // 2. Descartar alterações sujas prévias se houver
      try {
        this.run("git checkout .");
      } catch { /* ignore */ }

      // 3. Criar ou alternar para a branch de teste
      try {
        this.run(`git checkout -B ${branchName}`);
        console.log(`[Git] 🌿 Branch de teste isolada criada: ${branchName}`);
      } catch (err) {
        console.warn(`[Git] Aviso ao trocar de branch: ${(err as Error).message}`);
      }

      return branchName;
    } catch (e) {
      console.warn(`[Git] Aviso no setup da branch: ${(e as Error).message}`);
      return branchName;
    }
  }

  /**
   * Executa a suíte de validação: Linter e Testes
   */
  public runValidation(): ValidationResult {
    console.log("[Validação] 🧪 Executando verificação de tipos e linter (npm run lint)...");
    try {
      const lintOutput = this.run("npm run lint");
      console.log("[Validação] ✅ Linter aprovado!");

      console.log("[Validação] 🧪 Executando suíte de testes (npm test)...");
      try {
        const testOutput = this.run("npm test");
        console.log("[Validação] ✅ Testes aprovados!");
        return {
          passed: true,
          step: "test",
          output: `${lintOutput}\n${testOutput}`,
        };
      } catch (testError: any) {
        const errOut = (testError.stdout || "") + "\n" + (testError.stderr || testError.message);
        console.error("[Validação] ❌ Falha nos testes!");
        return {
          passed: false,
          step: "test",
          output: errOut,
        };
      }
    } catch (lintError: any) {
      const errOut = (lintError.stdout || "") + "\n" + (lintError.stderr || lintError.message);
      console.error("[Validação] ❌ Falha no linter / tipagem!");
      return {
        passed: false,
        step: "lint",
        output: errOut,
      };
    }
  }

  /**
   * Realiza commit na branch de teste e faz push caso remoto esteja configurado
   */
  public commitTestBranch(branchName: string, issueNumber: number, message: string): boolean {
    this.assertBranchSafety(branchName);

    try {
      this.run("git add -A");
      const safeIssue = Number.isInteger(issueNumber) ? issueNumber : 0;
      const commitMsg = `fix(issue-#${safeIssue}): ${String(message).slice(0, 500)}\n\nAutomated fix proposed by Self-Improving Agent`;
      // Pass arguments directly (no shell) so untrusted text cannot run commands.
      execFileSync("git", ["commit", "-m", commitMsg], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      console.log(`[Git] 💾 Commit realizado com sucesso na branch ${branchName}`);

      // Push para a branch de teste remota (se token ou remoto estiver configurado)
      if (process.env.GITHUB_TOKEN) {
        try {
          console.log(`[Git] 🚀 Subindo branch de teste ${branchName} para o GitHub...`);
          execFileSync("git", ["push", "-u", "origin", branchName, "--force"], { stdio: ["pipe", "pipe", "pipe"] });
          return true;
        } catch (pushErr: any) {
          console.warn(`[Git] Aviso ao subir branch remota: ${pushErr.message}`);
          return false;
        }
      }
      return true;
    } catch (e: any) {
      console.warn(`[Git] Aviso ao commitar: ${e.message}`);
      return false;
    }
  }

  /**
   * Descarta alterações locais e retorna para a branch base com segurança
   */
  public rollbackAndCleanup(branchName: string): void {
    console.log(`[Git] 🧹 Revertendo alterações e limpando branch de teste ${branchName}...`);
    try {
      this.run("git checkout .");
      this.run("git clean -fd");
      if (this.baseBranch) {
        try {
          this.run(`git checkout ${this.baseBranch}`);
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      console.warn(`[Git] Aviso durante rollback: ${err.message}`);
    }
  }
}
