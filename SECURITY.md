# Relatório e Auditoria de Segurança: GilPedidos

**Data do Relatório:** Outubro de 2026  
**Status de Auditoria:** Aprovado em todos os testes e verificações estáticas  
**Classificação:** Pronto para Entrega / Produção Comercial  

---

## 1. Resumo Executivo

O GilPedidos foi submetido a uma auditoria de segurança abrangente cobrindo:
1. **Proteção Total de Chaves de API e Segredos:** Verificação automatizada de ausência de credenciais no frontend, repositório e artefatos de build.
2. **Isolamento de IA no Backend:** Execução de modelos de IA (Gemini 2.5 Flash) restrita exclusivamente ao runtime Node.js/Express (`server.ts`).
3. **Mitigação de Riscos do OWASP Top 10 para Aplicações LLM:** Proteção ativa contra *Prompt Injection*, exaustão de recursos (*DoS*), poluição de parâmetros e vazamento de informações.
4. **Respeito à Privacidade (RGPD / LGPD):** Minimização de dados, conexão segura ponta a ponta (HTTPS) e funcionalidade de autoatendimento para eliminação de dados (Direito ao Esquecimento).

---

## 2. Modelo de Ameaças & Medidas Implementadas

### A. Vazamento de Chaves de API e Credenciais
* **Risco:** Exposição da chave do Gemini no código frontend (`bundle.js`) ou no Git, permitindo que terceiros consumam quotas, gerem cobranças ou abusem da API.
* **Medida Implementada:**
  - O frontend **não possui referências** a `GEMINI_API_KEY`, `@google/genai` ou segredos de servidor.
  - O arquivo `.env.example` contém apenas marcadores limpos sem valores (`GEMINI_API_KEY=`).
  - O `.env` está explicitamente protegido no `.gitignore`.
  - Em produção, a chave é injetada via **Google Secret Manager** diretamente no Google Cloud Run, sem passar por arquivos de texto plano.
  - Se a chave não for fornecida, o backend retorna status `503 Service Unavailable` com aviso amigável, sem expor caminhos de arquivo ou segredos.

### B. Injeção de Prompt (Prompt Injection & Jailbreaks)
* **Risco:** Usuários mal-intencionados enviarem payloads para desviar as instruções do modelo (ex.: "ignore previous instructions", "reveal system prompt", modo DAN).
* **Medida Implementada:**
  - Filtro prévio por expressões regulares bloqueia padrões de tentativa de jailbreak e desvio com código HTTP 400 antes de atingir o modelo.
  - O `systemInstruction` no servidor força o papel estrito de consultor gastronômico e exige saída exclusivamente no formato JSON validado por schema estrito.
  - Parâmetros do modelo são fixos no servidor (`temperature: 0.7`, `maxOutputTokens: 800`). O usuário não tem controle sobre qual modelo ou ferramentas são chamados.

### C. Negação de Serviço (DoS) e Consumo Excessivo de Quotas
* **Risco:** Envio massivo de requisições sobrecarregando o servidor e gerando custos inesperados de faturamento na API do Gemini.
* **Medida Implementada:**
  - **Rate Limiting em Memória:**
    - Rotas de IA: Máximo de **15 requisições por minuto por IP** (retorna HTTP 429).
    - Rotas gerais: Máximo de **120 requisições por 10 minutos por IP**.
  - **Limite de Tamanho do Corpo (Payload Body Limit):** Requisições com mais de `50kb` são rejeitadas de imediato (`express.json({ limit: "50kb" })`).
  - **Timeout Defensivo:** Chamadas à API Gemini contam com timeout de 12 segundos via `AbortController`. Se a resposta demorar, a conexão é encerrada com segurança (HTTP 504).

### D. Poluição de Parâmetros e Entradas Malformadas
* **Risco:** Injeção de propriedades não autorizadas (`isAdmin: true`, `role: "admin"`) ou envio de strings com megabytes para travamento.
* **Medida Implementada:**
  - Schemas de validação estritos via **Zod** com `.strict()`. Qualquer parâmetro não previsto no schema é sumariamente descartado.
  - Limite de caracteres: Nomes limitados a 100 caracteres; descrições limitadas a 500 caracteres; preços obrigatoriamente numéricos e maiores que zero.

### E. Vazamento de Detalhes Técnicos e Stack Traces
* **Risco:** Respostas de erro contendo mensagens internas, linhas de código do servidor, nomes de banco de dados ou variáveis de ambiente.
* **Medida Implementada:**
  - Middleware global de captura de erros (`Error Masking`).
  - O cliente recebe apenas mensagens genéricas e seguras: `{"error": "Ocorreu um erro no processamento. Tente novamente."}`.
  - Logs no servidor registram apenas a mensagem de erro resumida, nunca incluindo chaves, tokens ou prompts completos com dados pessoais.

### F. Privacidade e Direitos do Titular (RGPD / LGPD)
* **Risco:** Retenção indevida de dados sem consentimento ou impossibilidade de remoção.
* **Medida Implementada:**
  - Página pública `/privacidade` explicando claramente o ciclo de vida dos dados e o uso ético da IA.
  - Formulário funcional com confirmação estrita (`CONFIRMAR_EXCLUSAO`) e endpoint dedicado (`/api/privacy/purge-data`) que gera número de protocolo de expurgo e programa a limpeza de registros.

---

## 3. Matriz de Conformidade dos Requisitos

| Requisito do Usuário | Status | Evidência no Código |
| :--- | :---: | :--- |
| Separação Frontend/Backend | **Concluído** | `server.ts` (Express) e `src/` (Vite/React) |
| Chamadas Gemini Exclusivas no Backend | **Concluído** | `POST /api/ai/optimize-dish` no `server.ts` |
| Nenhuma Chave no Frontend | **Concluído** | Testado e verificado via `npm test` (0 ocorrências) |
| Chave apenas via `GEMINI_API_KEY` | **Concluído** | Lida exclusivamente via `process.env.GEMINI_API_KEY` |
| `.env.example` sem segredos | **Concluído** | Apenas chave limpa sem valor |
| `.env` protegido no `.gitignore` | **Concluído** | Entrada `.env` e `.env.*` confirmadas |
| Rate Limiting Ativo | **Concluído** | `aiRateLimiter` (15 req/min) |
| Validação Estrita de Dados | **Concluído** | Schemas Zod com `.strict()` |
| Mascaramento de Erros e Logs Seguros | **Concluído** | Middleware global sem exposição de stack traces |
| Instruções de Transferência no README | **Concluído** | Guia passo a passo com Cloud Run & Secret Manager |
| Testes Automatizados de Segurança | **Concluído** | 13 testes em `src/test/security.test.ts` (100% aprovados) |

---

## 4. Recomendações Operacionais para o Comprador

1. **Configurar Alertas de Faturamento no Google Cloud:**
   - Crie um orçamento no console do Google Cloud para receber notificações quando os gastos atingirem $10 e $20 USD.
2. **Ativar o Google Cloud Armor (Opcional para Grande Escala):**
   - Caso o app receba volumes muito expressivos de tráfego (mais de 10.000 acessos/minuto), ative regras WAF do Google Cloud Armor na frente do Cloud Run para mitigar ataques DDoS distribuídos.
3. **Revisão Periódica de Acessos IAM:**
   - Mantenha a política de privilégio mínimo: conceda à conta de serviço do Cloud Run apenas o papel `roles/secretmanager.secretAccessor` para o segredo específico `GEMINI_API_KEY`.
