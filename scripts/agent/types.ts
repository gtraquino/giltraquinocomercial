export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
  state: "open" | "closed";
}

export interface FileChange {
  filePath: string;
  newContent: string;
  reason: string;
}

export interface BugAttempt {
  id: string;
  timestamp: string;
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  hypothesis: string;
  filesModified: string[];
  testOutput: string;
  status: "success" | "test_failed" | "lint_failed" | "reverted" | "pr_created";
  rootCauseAnalysis: string;
  lessonsLearned: string[];
  retryCount: number;
  prUrl?: string;
  durationMs: number;
}

export interface PatternKnowledge {
  successfulStrategies: string[];
  pitfallsToAvoid: string[];
  occurrences: number;
}

export interface KnowledgeMemory {
  totalAttempts: number;
  successfulFixes: number;
  failedFixes: number;
  resolutionRate: number; // e.g. 85.5%
  history: BugAttempt[];
  patterns: Record<string, PatternKnowledge>;
  lastRunAt: string | null;
}

export interface ValidationResult {
  passed: boolean;
  step: "lint" | "test" | "build" | "none";
  output: string;
}
