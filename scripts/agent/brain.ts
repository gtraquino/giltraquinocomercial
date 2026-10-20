import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import type { FileChange, Issue } from "./types.js";

interface BrainDiagnosis {
  rootCause: string;
  hypothesis: string;
  modifiedFiles: FileChange[];
  lessonLearned: string;
}

export class AgentBrain {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }

  /**
   * Encontra arquivos potencialmente relevantes para o bug no repositório
   */
  private scanRelevantFiles(issueText: string): Record<string, string> {
    const fileContents: Record<string, string> = {};
    const lower = issueText.toLowerCase();

    // Pastas prioritárias para inspecionar
    const candidateDirs = ["src/lib", "src/contexts", "src/components", "src/pages", "src/utils"];

    for (const dir of candidateDirs) {
      const fullDir = path.resolve(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;

      try {
        const files = fs.readdirSync(fullDir, { recursive: true });
        for (const file of files) {
          if (typeof file !== "string" || (!file.endsWith(".ts") && !file.endsWith(".tsx"))) continue;

          const baseName = path.basename(file).replace(/\.(ts|tsx)$/, "").toLowerCase();
          // Se o nome do arquivo ou palavras chaves aparecerem no texto do bug
          if (lower.includes(baseName) || lower.includes(file.toLowerCase())) {
            const relPath = path.join(dir, file);
            try {
              const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
              // Limitar tamanho para não estourar contexto
              fileContents[relPath] = content.slice(0, 3000);
              if (Object.keys(fileContents).length >= 5) break;
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    return fileContents;
  }

  /**
   * Diagnostica e gera correção para o bug
   */
  public async diagnoseAndFix(
    issue: Issue,
    pastExperience: {
      lessons: string[];
      successfulStrategies: string[];
      pitfallsToAvoid: string[];
    },
    previousFailureFeedback?: string
  ): Promise<BrainDiagnosis> {
    const combinedIssueText = `${issue.title}\n${issue.body}`;
    const relevantCode = this.scanRelevantFiles(combinedIssueText);

    if (!this.ai) {
      console.warn("[AgentBrain] GEMINI_API_KEY não configurada. A usar diagnóstico de fallback.");
      return this.fallbackDiagnosis(issue);
    }

    const systemPrompt = `Você é um Engenheiro de Software Sênior autônomo responsável por corrigir bugs de forma precisa.
Regras fundamentais:
1. NUNCA quebre testes existentes ou a integridade do código.
2. Seja cirúrgico: altere apenas o que for estritamente necessário para corrigir o defeito.
3. Considere com muita atenção as lições aprendidas em execuções passadas para autoaprimorar sua taxa de acerto.
4. Se houver feedback de falha nos testes anteriores, adapte a estratégia para contornar o erro reportado.`;

    const userPrompt = `
=== DADOS DO BUG DO ISSUE TRACKER ===
Issue #${issue.number}: ${issue.title}
Descrição:
${issue.body}

=== MEMÓRIA E AUTOAPRIMORAMENTO (EXPERIÊNCIAS PASSADAS) ===
Lições aprendidas anteriormente:
${pastExperience.lessons.length > 0 ? pastExperience.lessons.map((l) => `- ${l}`).join("\n") : "Nenhuma lição anterior registrada ainda."}

Estratégias que deram certo:
${pastExperience.successfulStrategies.length > 0 ? pastExperience.successfulStrategies.map((s) => `- ${s}`).join("\n") : "Nenhuma ainda."}

Erros a evitar (tentativas passadas que falharam):
${pastExperience.pitfallsToAvoid.length > 0 ? pastExperience.pitfallsToAvoid.map((p) => `- ${p}`).join("\n") : "Nenhum ainda."}

${
  previousFailureFeedback
    ? `=== FEEDBACK DA TENTATIVA IMEDIATA QUE FALHOU ===\nA tentativa anterior gerou o seguinte erro de compilação/teste:\n${previousFailureFeedback}\nCorrija sua hipótese e gere uma correção alternativa que resolva o erro acima!`
    : ""
}

=== CÓDIGOS RELEVANTES DETECTADOS NO REPOSITÓRIO ===
${
  Object.keys(relevantCode).length > 0
    ? Object.entries(relevantCode)
        .map(([filePath, code]) => `--- Arquivo: ${filePath} ---\n${code}\n`)
        .join("\n")
    : "Nenhum arquivo específico identificado no texto inicial. Identifique o arquivo correto do repositório baseado na descrição."
}

Forneça sua resposta estruturada com causa raiz, hipótese, arquivos modificados com código completo e lição aprendida.`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rootCause: {
                type: Type.STRING,
                description: "Explicação técnica detalhada do motivo do bug.",
              },
              hypothesis: {
                type: Type.STRING,
                description: "Hipótese de correção proposta.",
              },
              modifiedFiles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    filePath: { type: Type.STRING },
                    newContent: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ["filePath", "newContent", "reason"],
                },
              },
              lessonLearned: {
                type: Type.STRING,
                description: "Lição aprendida com este bug para autoaprimoramento futuro.",
              },
            },
            required: ["rootCause", "hypothesis", "modifiedFiles", "lessonLearned"],
          },
        },
      });

      const parsed: BrainDiagnosis = JSON.parse(response.text.trim());
      return parsed;
    } catch (err: any) {
      console.error("[AgentBrain] Erro na chamada à API Gemini:", err.message);
      return this.fallbackDiagnosis(issue);
    }
  }

  private fallbackDiagnosis(issue: Issue): BrainDiagnosis {
    return {
      rootCause: `Bug reportado no issue #${issue.number}: ${issue.title}. Análise de fallback automática.`,
      hypothesis: `Refatorar tratamento de exceções e validação para o problema descrito.`,
      modifiedFiles: [],
      lessonLearned: `Identificado padrão em "${issue.title}". Requer teste de regressão adicional.`,
    };
  }
}
