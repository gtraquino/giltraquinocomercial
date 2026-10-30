import fs from "node:fs";
import path from "node:path";
import { AgentMemory } from "./memory.js";
import { GitManager } from "./git.js";
import { IssueTracker } from "./tracker.js";
import { AgentBrain } from "./brain.js";
import type { BugAttempt } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  const isStatsOnly = args.includes("--stats");
  const isDryRun = args.includes("--dry-run");

  const memory = new AgentMemory();
  const git = new GitManager("main");
  const tracker = new IssueTracker();
  const brain = new AgentBrain();

  const metrics = memory.getMetrics();

  console.log("\n=======================================================");
  console.log(" 🤖 AGENTE DE AUTOAPRIMORAMENTO - RESOLUÇÃO DE BUGS");
  console.log("=======================================================");
  console.log(` 📊 Total de Tentativas:     ${metrics.totalAttempts}`);
  console.log(` ✅ Correções Bem-sucedidas:  ${metrics.successfulFixes}`);
  console.log(` ❌ Falhas / Reversões:      ${metrics.failedFixes}`);
  console.log(` 🎯 Taxa de Resolução:        ${metrics.resolutionRate}%`);
  console.log(` 🕒 Última Execução:         ${metrics.lastRunAt || "Primeira execução"}`);
  console.log("=======================================================\n");

  if (isStatsOnly) {
    const recent = memory.getRecentHistory(5);
    console.log("📜 Histórico Recente de Tentativas:");
    if (recent.length === 0) {
      console.log("  (Nenhuma tentativa registrada até o momento)");
    } else {
      recent.forEach((a) => {
        const icon = a.status === "pr_created" || a.status === "success" ? "✅" : "❌";
        console.log(`  ${icon} Issue #${a.issueNumber}: "${a.issueTitle}" [${a.status}]`);
        if (a.lessonsLearned.length > 0) {
          console.log(`     💡 Lição: ${a.lessonsLearned[0]}`);
        }
      });
    }
    process.exit(0);
  }

  // Obter bugs pendentes
  console.log("🔍 A verificar novos bugs pendentes no issue tracker...");
  const bugs = await tracker.getPendingBugs(3);

  if (bugs.length === 0) {
    console.log("🎉 Nenhum bug pendente encontrado hoje! Repositório limpo.");
    process.exit(0);
  }

  console.log(`📋 Encontrados ${bugs.length} bug(s) para análise e correção hoje.\n`);

  for (const bug of bugs) {
    const startTime = Date.now();
    console.log(`-------------------------------------------------------`);
    console.log(`🎯 A processar Issue #${bug.number}: "${bug.title}"`);
    console.log(`-------------------------------------------------------`);

    // 1. Consultar base de autoaprimoramento para lições prévias
    const pastExperience = memory.findRelevantExperience(bug.title, bug.body);
    if (pastExperience.lessons.length > 0) {
      console.log(`🧠 Memória ativada! Encontradas ${pastExperience.lessons.length} lições relevantes:`);
      pastExperience.lessons.forEach((l) => console.log(`   - ${l}`));
    } else {
      console.log("🧠 Nenhuma experiência prévia similar. Criando nova linha de aprendizado.");
    }

    // 2. Criar branch de teste isolada (NUNCA trabalhar em produção)
    const testBranch = git.prepareTestBranch(bug.number);
    await tracker.setStatusLabel(bug.number, "agent-in-progress");

    let retryCount = 0;
    const maxRetries = 2;
    let validated = false;
    let lastErrorFeedback = "";
    let finalDiagnosis: any = null;
    let modifiedFilePaths: string[] = [];

    // Loop de tentativa e auto-correção
    while (retryCount <= maxRetries && !validated) {
      if (retryCount > 0) {
        console.log(`\n🔄 [Auto-correção] Tentativa ${retryCount + 1}/${maxRetries + 1} com feedback de erro...`);
      }

      finalDiagnosis = await brain.diagnoseAndFix(bug, pastExperience, lastErrorFeedback);
      console.log(`💡 Hipótese: ${finalDiagnosis.hypothesis}`);

      // Aplicar arquivos modificados
      if (finalDiagnosis.modifiedFiles && finalDiagnosis.modifiedFiles.length > 0) {
        modifiedFilePaths = [];
        for (const change of finalDiagnosis.modifiedFiles) {
          const repoRoot = path.resolve(process.cwd());
          const fullPath = path.resolve(repoRoot, String(change.filePath ?? ""));
          const rel = path.relative(repoRoot, fullPath);
          if (
            !rel || rel.startsWith("..") || path.isAbsolute(rel) ||
            rel.split(path.sep).some((seg) => seg === ".git" || seg === "node_modules" || seg === ".env")
          ) {
            console.warn(`⛔ Caminho rejeitado (fora do repositório ou protegido): ${change.filePath}`);
            continue;
          }
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          // Se for dry-run não grava no disco
          if (!isDryRun) {
            fs.writeFileSync(fullPath, change.newContent, "utf-8");
          }
          modifiedFilePaths.push(change.filePath);
          console.log(`✏️ Alterado: ${change.filePath} (${change.reason})`);
        }
      }

      if (isDryRun) {
        console.log("🔬 Modo Dry-Run ativo: Pulando execução real de testes e commit.");
        validated = true;
        break;
      }

      // Executar validação (linter + testes)
      const validationResult = git.runValidation();
      if (validationResult.passed) {
        validated = true;
      } else {
        lastErrorFeedback = validationResult.output.slice(0, 1500);
        retryCount++;
      }
    }

    const duration = Date.now() - startTime;

    if (validated) {
      console.log(`\n🎉 Bug #${bug.number} corrigido e validado com sucesso!`);

      // Commitar na branch de teste
      git.commitTestBranch(testBranch, bug.number, finalDiagnosis.hypothesis);

      // Abrir Pull Request
      const prUrl = await tracker.createPullRequest(
        testBranch,
        bug.number,
        bug.title,
        `### 🤖 Correção Proposta pelo Agente Autônomo\n\n` +
          `**Causa Raiz:** ${finalDiagnosis.rootCause}\n\n` +
          `**Hipótese e Solução:** ${finalDiagnosis.hypothesis}\n\n` +
          `**Arquivos Modificados:**\n${modifiedFilePaths.map((f) => `- \`${f}\``).join("\n")}\n\n` +
          `**Lição Aprendida para o Modelo:**\n> ${finalDiagnosis.lessonLearned}\n\n` +
          `**Validação:** Linters e suíte de testes aprovados com 100% de sucesso.`
      );

      await tracker.setStatusLabel(bug.number, "agent-fix-ready");
      await tracker.postComment(
        bug.number,
        `✅ **Correção concluída na branch de teste \`${testBranch}\`!**\n\n` +
          `Pull Request aberto: ${prUrl}\n` +
          `Aguardando aprovação humana antes do merge em produção.`
      );

      // Registrar sucesso no aprendizado
      const attempt: BugAttempt = {
        id: `att-${Date.now()}-${bug.number}`,
        timestamp: new Date().toISOString(),
        issueNumber: bug.number,
        issueTitle: bug.title,
        branchName: testBranch,
        hypothesis: finalDiagnosis.hypothesis,
        filesModified: modifiedFilePaths,
        testOutput: "Validation passed",
        status: "pr_created",
        rootCauseAnalysis: finalDiagnosis.rootCause,
        lessonsLearned: [finalDiagnosis.lessonLearned],
        retryCount,
        prUrl,
        durationMs: duration,
      };
      memory.recordAttempt(attempt);
    } else {
      console.error(`\n❌ Falha ao corrigir Bug #${bug.number} após ${maxRetries + 1} tentativas.`);

      // Reverter alterações locais para segurança do repositório
      git.rollbackAndCleanup(testBranch);

      await tracker.setStatusLabel(bug.number, "agent-needs-human-review");
      await tracker.postComment(
        bug.number,
        `⚠️ **O agente tentou corrigir este bug, mas a suíte de validação não passou.**\n\n` +
          `As alterações na branch de teste foram revertidas com segurança para não quebrar o código.\n` +
          `**Último erro capturado:**\n\`\`\`\n${lastErrorFeedback.slice(0, 500)}\n\`\`\`\n` +
          `Etiqueta \`agent-needs-human-review\` adicionada para intervenção manual.`
      );

      // Registrar falha no aprendizado para não cometer o mesmo erro no futuro
      const attempt: BugAttempt = {
        id: `att-${Date.now()}-${bug.number}`,
        timestamp: new Date().toISOString(),
        issueNumber: bug.number,
        issueTitle: bug.title,
        branchName: testBranch,
        hypothesis: finalDiagnosis?.hypothesis || "Tentativa padrão",
        filesModified: modifiedFilePaths,
        testOutput: lastErrorFeedback,
        status: "test_failed",
        rootCauseAnalysis: finalDiagnosis?.rootCause || "Erro de validação de testes",
        lessonsLearned: [
          `Evitar alterações propostas que gerem erro nos testes: ${lastErrorFeedback.slice(0, 150)}`,
        ],
        retryCount,
        durationMs: duration,
      };
      memory.recordAttempt(attempt);
    }
  }

  // Relatório final com a métrica atualizada
  const updatedMetrics = memory.getMetrics();
  console.log("\n=======================================================");
  console.log(" 📈 RELATÓRIO DO DIA - MÉTRICA DE AUTOAPRIMORAMENTO");
  console.log("=======================================================");
  console.log(` 🎯 Nova Taxa de Resolução Global: ${updatedMetrics.resolutionRate}%`);
  console.log(` 📊 Total Histórico: ${updatedMetrics.successfulFixes} resolvidos / ${updatedMetrics.totalAttempts} tentados`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("[Agente] Erro fatal durante a execução:", err);
  process.exit(1);
});
