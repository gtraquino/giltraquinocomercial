import fs from "node:fs";
import path from "node:path";
import type { BugAttempt, KnowledgeMemory, PatternKnowledge } from "./types.js";

const AGENT_DIR = path.resolve(process.cwd(), ".agent");
const MEMORY_FILE = path.join(AGENT_DIR, "knowledge-base.json");

export class AgentMemory {
  private memory: KnowledgeMemory;

  constructor() {
    this.memory = this.loadMemory();
  }

  private loadMemory(): KnowledgeMemory {
    if (!fs.existsSync(AGENT_DIR)) {
      fs.mkdirSync(AGENT_DIR, { recursive: true });
    }

    if (fs.existsSync(MEMORY_FILE)) {
      try {
        const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          totalAttempts: parsed.totalAttempts || 0,
          successfulFixes: parsed.successfulFixes || 0,
          failedFixes: parsed.failedFixes || 0,
          resolutionRate: parsed.resolutionRate || 0,
          history: parsed.history || [],
          patterns: parsed.patterns || {},
          lastRunAt: parsed.lastRunAt || null,
        };
      } catch (e) {
        console.warn("[AgentMemory] Falha ao ler memória anterior, iniciando nova base:", e);
      }
    }

    return {
      totalAttempts: 0,
      successfulFixes: 0,
      failedFixes: 0,
      resolutionRate: 0,
      history: [],
      patterns: {},
      lastRunAt: null,
    };
  }

  public saveMemory(): void {
    if (!fs.existsSync(AGENT_DIR)) {
      fs.mkdirSync(AGENT_DIR, { recursive: true });
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memory, null, 2), "utf-8");
  }

  public getMetrics(): {
    totalAttempts: number;
    successfulFixes: number;
    failedFixes: number;
    resolutionRate: number;
    lastRunAt: string | null;
  } {
    return {
      totalAttempts: this.memory.totalAttempts,
      successfulFixes: this.memory.successfulFixes,
      failedFixes: this.memory.failedFixes,
      resolutionRate: this.memory.resolutionRate,
      lastRunAt: this.memory.lastRunAt,
    };
  }

  public getRecentHistory(limit = 10): BugAttempt[] {
    return this.memory.history.slice(-limit).reverse();
  }

  /**
   * Autoaprimoramento: Encontra lições aprendidas em tentativas passadas
   * que contenham palavras-chave semelhantes ou arquivos afetados.
   */
  public findRelevantExperience(title: string, body: string): {
    lessons: string[];
    successfulStrategies: string[];
    pitfallsToAvoid: string[];
  } {
    const text = `${title} ${body}`.toLowerCase();
    const keywords = text
      .replace(/[^a-z0-9_\-\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const relevantLessons = new Set<string>();
    const successfulStrategies = new Set<string>();
    const pitfallsToAvoid = new Set<string>();

    // 1. Procurar em padrões catalogados
    for (const [patternKey, data] of Object.entries(this.memory.patterns)) {
      if (text.includes(patternKey.toLowerCase())) {
        data.successfulStrategies.forEach((s) => successfulStrategies.add(s));
        data.pitfallsToAvoid.forEach((p) => pitfallsToAvoid.add(p));
      }
    }

    // 2. Procurar em histórico de tentativas passadas
    for (const attempt of this.memory.history) {
      const matchScore = keywords.some(
        (kw) =>
          attempt.issueTitle.toLowerCase().includes(kw) ||
          attempt.rootCauseAnalysis.toLowerCase().includes(kw)
      );

      if (matchScore) {
        attempt.lessonsLearned.forEach((l) => relevantLessons.add(l));
        if (attempt.status === "pr_created" || attempt.status === "success") {
          successfulStrategies.add(`Solução anterior bem-sucedida: ${attempt.hypothesis}`);
        } else {
          pitfallsToAvoid.add(`Falhou anteriormente ao tentar: ${attempt.hypothesis}`);
        }
      }
    }

    return {
      lessons: Array.from(relevantLessons).slice(0, 5),
      successfulStrategies: Array.from(successfulStrategies).slice(0, 5),
      pitfallsToAvoid: Array.from(pitfallsToAvoid).slice(0, 5),
    };
  }

  /**
   * Grava uma tentativa e recalcula a taxa de resolução de sucesso
   */
  public recordAttempt(attempt: BugAttempt): void {
    this.memory.history.push(attempt);
    this.memory.totalAttempts += 1;

    const isSuccess = attempt.status === "success" || attempt.status === "pr_created";
    if (isSuccess) {
      this.memory.successfulFixes += 1;
    } else {
      this.memory.failedFixes += 1;
    }

    // Recalcular métrica de sucesso (Taxa de Resolução %)
    this.memory.resolutionRate = Number(
      ((this.memory.successfulFixes / this.memory.totalAttempts) * 100).toFixed(1)
    );
    this.memory.lastRunAt = new Date().toISOString();

    // Extrair termos chave para o dicionário de padrões de aprendizado
    const terms = `${attempt.issueTitle} ${attempt.rootCauseAnalysis}`
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 5 && !["quando", "depois", "porque", "sistema"].includes(w))
      .slice(0, 3);

    for (const term of terms) {
      if (!this.memory.patterns[term]) {
        this.memory.patterns[term] = {
          successfulStrategies: [],
          pitfallsToAvoid: [],
          occurrences: 0,
        };
      }
      this.memory.patterns[term].occurrences += 1;
      if (isSuccess && attempt.hypothesis) {
        if (!this.memory.patterns[term].successfulStrategies.includes(attempt.hypothesis)) {
          this.memory.patterns[term].successfulStrategies.push(attempt.hypothesis);
        }
      } else if (!isSuccess && attempt.hypothesis) {
        if (!this.memory.patterns[term].pitfallsToAvoid.includes(attempt.hypothesis)) {
          this.memory.patterns[term].pitfallsToAvoid.push(attempt.hypothesis);
        }
      }
    }

    this.saveMemory();
  }
}
