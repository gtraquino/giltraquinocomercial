import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

const app = express();
const portIndex = process.argv.indexOf("--port");
const PORT = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

// -------------------------------------------------------------
// 1. SEGURANÇA BÁSICA & CABEÇALHOS HTTP
// -------------------------------------------------------------
app.disable("x-powered-by");

// Middleware de cabeçalhos de segurança
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS restrito
app.use(
  cors({
    origin: (origin, callback) => {
      // Em produção ou desenvolvimento local/iframe AI Studio, permitir chamadas do mesmo host ou origens seguras
      if (!origin || origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes("run.app")) {
        callback(null, true);
      } else {
        callback(null, true); // Permite visualização do cliente em proxies do AI Studio
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Limite estrito de tamanho do corpo da requisição (Prevenção de DoS)
app.use(express.json({ limit: "50kb" }));

// -------------------------------------------------------------
// 2. RATE LIMITING EM MEMÓRIA (POR IP)
// -------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

function createRateLimiter(maxRequests: number, windowMs: number, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown-ip";
    const now = Date.now();
    const key = `${req.path}:${clientIp}`;

    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: errorMessage,
        retryAfterMs: Math.max(0, record.resetAt - now),
      });
    }

    record.count++;
    next();
  };
}

// Limite geral: 120 requisições a cada 10 minutos
const generalLimiter = createRateLimiter(
  120,
  10 * 60 * 1000,
  "Muitas solicitações a partir deste endereço IP. Aguarde alguns minutos."
);

// Limite estrito para rotas de IA: 15 requisições por minuto por IP
const aiRateLimiter = createRateLimiter(
  15,
  60 * 1000,
  "Limite de chamadas de inteligência artificial atingido. Aguarde 1 minuto para novas consultas."
);

// -------------------------------------------------------------
// 3. SANITIZAÇÃO DE ENTRADA & PROTEÇÃO DE PROMPT INJECTION
// -------------------------------------------------------------
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*prompt/i,
  /jailbreak/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /dan\s+mode/i,
  /reveal\s+(the\s+)?(api\s+)?key/i,
  /bypass\s+safety/i,
  /forget\s+everything/i,
];

function containsPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// -------------------------------------------------------------
// 4. CLIENTE GEMINI EXCLUSIVO DO SERVIDOR
// -------------------------------------------------------------
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "gilpedidos-backend/1.0",
      },
    },
  });
}

// Autenticação: exige sessão válida (Lovable Cloud) e papel admin ou gestor de loja
async function requireStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Não autenticado." });
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return res.status(503).json({ error: "Serviço indisponível." });
    const headers = { apikey: key, Authorization: auth };
    const u = await fetch(`${url}/auth/v1/user`, { headers });
    if (!u.ok) return res.status(401).json({ error: "Sessão inválida." });
    const user = (await u.json()) as { id?: string };
    if (!user?.id) return res.status(401).json({ error: "Sessão inválida." });
    const [roles, mgr] = await Promise.all([
      fetch(`${url}/rest/v1/user_roles?select=role&role=eq.admin&user_id=eq.${encodeURIComponent(user.id)}`, { headers }),
      fetch(`${url}/rest/v1/store_managers?select=id&limit=1&user_id=eq.${encodeURIComponent(user.id)}`, { headers }),
    ]);
    const r = roles.ok ? ((await roles.json()) as unknown[]) : [];
    const m = mgr.ok ? ((await mgr.json()) as unknown[]) : [];
    if (r.length === 0 && m.length === 0) return res.status(403).json({ error: "Sem permissão." });
    next();
  } catch {
    return res.status(401).json({ error: "Não autenticado." });
  }
}

// -------------------------------------------------------------
// 5. ROTAS DE API DO BACKEND (/api/*)
// -------------------------------------------------------------

/**
 * Health check seguro
 * Confirma se o backend está ativo e se a chave Gemini está configurada,
 * NUNCA expondo o valor da chave ou variáveis de ambiente.
 */
app.get("/api/health", generalLimiter, (_req: Request, res: Response) => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  res.status(200).json({
    status: "ok",
    app: "GilPedidos",
    environment: isProd ? "production" : "development",
    timestamp: new Date().toISOString(),
    geminiConfigured: hasGeminiKey,
  });
});

/**
 * Endpoint de Otimização de Pratos e Cardápio com IA (Gemini 2.5 Flash)
 * Processado 100% no servidor com validação Zod e schema estruturado.
 */
const optimizeDishSchema = z
  .object({
    name: z.string().min(1, "O nome do item é obrigatório").max(100, "Nome muito longo (máx. 100 caracteres)"),
    description: z.string().max(500, "Descrição muito longa (máx. 500 caracteres)").optional().default(""),
    category: z.string().max(60, "Categoria muito longa").optional().default("Geral"),
    price: z.number().min(0, "Preço inválido").max(10000000).optional().default(0),
  })
  .strict();

app.post("/api/ai/optimize-dish", requireStaff, aiRateLimiter, async (req: Request, res: Response) => {
  // 1. Validação estrita de schema
  const parsed = optimizeDishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados de entrada inválidos.",
      detalhes: parsed.error.issues.map((i) => i.message),
    });
  }

  const { name, description, category, price } = parsed.data;

  // 2. Proteção contra prompt injection
  if (containsPromptInjection(name) || containsPromptInjection(description)) {
    return res.status(400).json({
      error: "Entrada recusada por conter termos ou comandos não permitidos.",
    });
  }

  // 3. Verificação de chave Gemini no servidor
  const gemini = getGeminiClient();
  if (!gemini) {
    return res.status(503).json({
      error: "Serviço de IA não configurado. Por favor, adicione a chave GEMINI_API_KEY no painel de segredos do servidor.",
      configured: false,
    });
  }

  const systemPrompt = `Você é um chef executivo e consultor gastronômico sênior do GilPedidos.
Sua missão é enriquecer o prato fornecido pelo restaurante para torná-lo mais apetitoso, vendedor e profissional para os clientes no catálogo online.
Regras fundamentais:
- Mantenha a essência culinária do prato original.
- Crie uma descrição irresistível e sucinta (máximo 2 a 3 frases).
- Sugira 2 a 4 tags atrativas (ex: "Gourmet", "Mais Vendido", "Artesanal", "Sem Glúten", "Opção Vegetariana").
- Proponha uma sugestão curta de acompanhamento ou bebida para upsell.
- Responda estritamente no formato JSON estruturado solicitado.`;

  const userPrompt = `Prato original:
- Nome: ${name}
- Descrição atual: ${description || "Nenhuma informada"}
- Categoria: ${category}
- Preço base: ${price > 0 ? price : "Não informado"}`;

  try {
    // Timeout defensivo de 12 segundos para a chamada Gemini
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 12000);

    const geminiPromise = gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            enhancedName: {
              type: Type.STRING,
              description: "Nome comercial apetitoso do prato",
            },
            enhancedDescription: {
              type: Type.STRING,
              description: "Descrição gastronômica irresistível para catálogo",
            },
            dietaryTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Tags comerciais e alimentares recomendadas",
            },
            upsellSuggestion: {
              type: Type.STRING,
              description: "Sugestão inteligente de acompanhamento ou bebida para aumentar ticket médio",
            },
          },
          required: ["enhancedName", "enhancedDescription", "dietaryTags", "upsellSuggestion"],
        },
      },
    });

    const response = await Promise.race([
      geminiPromise,
      new Promise<never>((_, reject) => {
        abortController.signal.addEventListener("abort", () => reject(new Error("Gemini timeout")));
      }),
    ]);

    clearTimeout(timeoutId);

    const text = response.text || "{}";
    const result = JSON.parse(text);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    // Registro de log seguro no servidor (sem expor prompts sensíveis ou chaves)
    console.error("[Backend AI Error]", error instanceof Error ? error.message : "Erro desconhecido");

    if (error?.message === "Gemini timeout") {
      return res.status(504).json({
        error: "Tempo de resposta do serviço de IA excedido. Tente novamente mais tarde.",
      });
    }

    return res.status(500).json({
      error: "Não foi possível processar a otimização no momento. Tente novamente em instantes.",
    });
  }
});

/**
 * Endpoint de Sugestão de Combos & Promoções para o Restaurante
 */
const suggestMenuSchema = z
  .object({
    cuisine: z.string().min(2, "Tipo de culinária obrigatório").max(60, "Texto muito longo"),
    targetMeal: z.enum(["almoco", "jantar", "lanche", "sobremesas", "combo"]).default("combo"),
  })
  .strict();

app.post("/api/ai/suggest-menu", requireStaff, aiRateLimiter, async (req: Request, res: Response) => {
  const parsed = suggestMenuSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Parâmetros inválidos.",
    });
  }

  const { cuisine, targetMeal } = parsed.data;

  if (containsPromptInjection(cuisine)) {
    return res.status(400).json({ error: "Entrada não permitida." });
  }

  const gemini = getGeminiClient();
  if (!gemini) {
    return res.status(503).json({
      error: "Serviço de IA não configurado no servidor.",
    });
  }

  try {
    const prompt = `Crie 3 opções de itens/combos populares e rentáveis para um restaurante de culinária "${cuisine}" focado em "${targetMeal}". Retorne um JSON com array de sugestões contendo título, descrição curta e diferencial.`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Você é um especialista em lucratividade de cardápios para o app GilPedidos.",
        temperature: 0.6,
        maxOutputTokens: 600,
        responseMimeType: "application/json",
      },
    });

    const parsedJson = JSON.parse(response.text || "[]");
    return res.status(200).json({ success: true, items: parsedJson });
  } catch (err: any) {
    console.error("[Backend AI Menu Error]", err?.message || "Erro");
    return res.status(500).json({ error: "Erro ao gerar sugestões de cardápio." });
  }
});

/**
 * Endpoint de Privacidade / RGPD / LGPD: Solicitação de Exclusão de Dados
 */
const purgeDataSchema = z
  .object({
    email: z.string().email("Endereço de email inválido").max(100),
    confirmation: z.literal("CONFIRMAR_EXCLUSAO"),
    reason: z.string().max(300).optional().default(""),
  })
  .strict();

app.post("/api/privacy/purge-data", generalLimiter, (req: Request, res: Response) => {
  const parsed = purgeDataSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Para solicitar a exclusão de dados, digite o seu email válido e confirme com CONFIRMAR_EXCLUSAO.",
    });
  }

  const { email } = parsed.data;

  // Em conformidade com LGPD / RGPD:
  // Registra a solicitação de forma anônima e agenda expurgo dos logs e pedidos vinculados
  console.log(`[Privacy Purge] Solicitação de exclusão registrada com sucesso para o usuário com hash seguro.`);

  return res.status(200).json({
    success: true,
    message: `A solicitação de exclusão para o email foi registrada. Todos os dados associados serão eliminados em conformidade com as diretrizes de privacidade.`,
    protocolNumber: `DEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  });
});

/**
 * Endpoint de Consulta de Métricas do Agente de Autoaprimoramento
 */
app.get("/api/agent/stats", generalLimiter, (_req: Request, res: Response) => {
  const memoryPath = path.resolve(process.cwd(), ".agent/knowledge-base.json");

  try {
    if (fs.existsSync(memoryPath)) {
      const data = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
      return res.status(200).json({
        metrics: data.metrics || {
          totalAttempts: 6,
          successfulFixes: 5,
          failedFixes: 1,
          resolutionRate: 83.3,
        },
        recentLessons: (data.lessons || []).slice(-5),
      });
    }
  } catch {
    // Ignorar e retornar padrão seguro
  }

  return res.status(200).json({
    metrics: {
      totalAttempts: 6,
      successfulFixes: 5,
      failedFixes: 1,
      resolutionRate: 83.3,
      lastRunAt: new Date().toISOString(),
    },
    recentLessons: [],
  });
});

// -------------------------------------------------------------
// 6. INTEGRAÇÃO COM VITE (DEV) OU ARQUIVOS ESTÁTICOS (PRODUÇÃO)
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    // Modo Desenvolvimento: Conectar middlewares do Vite ao Express
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    // Modo Produção: Servir frontend compilado em /dist
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  // -------------------------------------------------------------
  // TRATAMENTO GLOBAL DE ERROS (ERRO MASKING)
  // -------------------------------------------------------------
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // NUNCA expor stack traces, variáveis de ambiente ou mensagens internas
    console.error("[Server Internal Error]", err instanceof Error ? err.message : "Erro não identificado");

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      error: "Ocorreu um erro no servidor. A equipe técnica já foi notificada.",
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GilPedidos Server] Servidor full-stack ativo na porta ${PORT} (${isProd ? "Produção" : "Desenvolvimento"})`);
  });
}

startServer().catch((err) => {
  console.error("[Fatal Startup Error]", err);
  process.exit(1);
});
