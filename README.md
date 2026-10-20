# GilPedidos - Plataforma Full-Stack de Encomendas & Catálogo Digital com IA

Plataforma full-stack para restaurantes, lanchonetes e comércio criarem catálogos digitais responsivos, gerenciarem produtos, inventário e pedidos com encaminhamento direto para o WhatsApp, com otimização inteligente de cardápios via Google Gemini API executada exclusivamente no backend.

---

## 🏛️ Arquitetura do Sistema

O projeto foi construído seguindo um padrão rígido de **segurança defensiva e separação total de responsabilidades**:

```
                                [ NAVEGADOR DO CLIENTE ]
                                           │
                        (NENHUMA chave API ou SDK Gemini no Frontend)
                                           │
                                    HTTPS / TLS 1.3
                                           │
                                           ▼
                                [ SERVIDOR EXPRESS (Node.js) ]
                ┌──────────────────────────┴──────────────────────────┐
                │  - Rate Limiting por IP (Geral e IA)                │
                │  - Sanitização de Prompt Injection                  │
                │  - Validação estrita de Schemas (Zod)               │
                │  - Mascaramento e proteção de erros (No stackleak)  │
                │  - Cabeçalhos de Segurança (CSP, nosniff, CORS)     │
                └──────────────────────────┬──────────────────────────┘
                                           │
                          process.env.GEMINI_API_KEY
                         (Google Secret Manager / Nuvem)
                                           │
                                           ▼
                              [ GOOGLE GEMINI 2.5 FLASH ]
```

### Regras Fundamentais de Segurança
1. **Frontend Isolado:** O código client-side (`src/`) **nunca** importa `@google/genai` e **nunca** manipula credenciais ou segredos.
2. **Backend Exclusivo:** Todas as consultas de IA ocorrem em rotas privadas (`/api/ai/*`) no `server.ts`.
3. **Proteção de Segredos:** A variável `GEMINI_API_KEY` existe apenas em tempo de execução no servidor. Nunca é gravada no Git, repositório ou enviada ao navegador.
4. **Resiliência e Continuidade:** Se a chave de API não estiver configurada no servidor, o sistema devolve uma mensagem limpa com código 503 sem travar o aplicativo.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js 20+ ou 22 LTS
- NPM ou Bun instalado

### 1. Clonar e Instalar Dependências
```bash
git clone <URL_DO_REPOSITORIO>
cd gilpedidos
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o modelo seguro de `.env.example`:
```bash
cp .env.example .env
```
Edite o arquivo `.env` adicionando a sua chave para testes locais:
```env
GEMINI_API_KEY=sua_chave_gemini_aqui
PORT=3000
NODE_ENV=development
```
*(Nota: O arquivo `.env` já está no `.gitignore` e nunca será comitado).*

### 3. Iniciar o Servidor Full-Stack (Dev)
```bash
npm run dev
```
Acesse o aplicativo em seu navegador: `http://localhost:3000`.

### 4. Executar os Testes Automatizados de Segurança
```bash
npm test
```

---

## 📦 Guia Completo de Instalação e Transferência para o Comprador

Este guia instrui o comprador a implantar o GilPedidos diretamente em sua própria conta Google Cloud, sem intermediários e com controle total de custos.

### Passo 1: Criar o Projeto no Google Cloud
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Clique no seletor de projetos no topo da tela e selecione **Novo Projeto**.
3. Defina o nome do projeto (ex.: `gilpedidos-producao`) e vincule uma conta de faturamento (Billing Account).

### Passo 2: Ativar as APIs Necessárias
Execute via Cloud Shell ou terminal local autenticado com a Google Cloud CLI (`gcloud`):
```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  generativelanguage.googleapis.com \
  cloudbuild.googleapis.com \
  --project="SEU_PROJECT_ID"
```

### Passo 3: Criar a Chave da API Gemini na Conta do Comprador
1. Acesse o [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Clique em **Create API key** e selecione o projeto Google Cloud criado no Passo 1.
3. Copie a chave gerada. **NUNCA envie essa chave por email, WhatsApp ou chat.**

### Passo 4: Guardar a Credencial no Google Secret Manager
Armazene a chave de forma criptografada e segura:
```bash
echo -n "SUA_CHAVE_GEMINI_COPIADA" | gcloud secrets create GEMINI_API_KEY \
  --data-file=- \
  --replication-policy="automatic" \
  --project="SEU_PROJECT_ID"
```

### Passo 5: Fazer o Deploy no Google Cloud Run
Compile e implante o aplicativo configurando a injeção do segredo diretamente no container:
```bash
gcloud run deploy gilpedidos-app \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production,PORT=3000" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --project="SEU_PROJECT_ID"
```

O Cloud Run solicitará autorização para que sua conta de serviço acesse o Secret Manager. Digite `Y` (Sim) para conceder automaticamente o papel `roles/secretmanager.secretAccessor`.

---

## 🌐 Configuração de Domínio Personalizado e HTTPS

1. No Google Cloud Console, vá para **Cloud Run** > selecione o serviço `gilpedidos-app` > aba **Custom Domains** (Domínios personalizados).
2. Clique em **Add Mapping** (Adicionar Mapeamento).
3. Insira o seu domínio (ex.: `pedidos.seurestaurante.com`).
4. O Google Cloud fornecerá os registros DNS (como tipo `CNAME` ou `A`).
5. Acesse a zona DNS do seu provedor de domínio (GoDaddy, Cloudflare, Registro.br, etc.) e crie os registros apontados.
6. O Google provisionará automaticamente o certificado **SSL/TLS gerenciado e gratuito** com renovação automática.

---

## 🔑 Rotação, Revogação e Custos da Chave API

### Alterar ou Rotacionar a Chave
Se suspeitar de comprometimento ou desejar rotacionar a chave:
1. Gere uma nova chave no Google AI Studio.
2. Adicione uma nova versão no Secret Manager:
   ```bash
   echo -n "NOVA_CHAVE_AQUI" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
   ```
3. O Cloud Run atualizará automaticamente na próxima inicialização de contêiner. Em seguida, exclua a versão anterior no console.

### Revogar a Chave Antiga
Acesse o painel de chaves no Google Cloud Console (`APIs & Services` > `Credentials`) e clique no ícone de lixeira ao lado da chave a ser revogada.

### Monitorar Consumo e Limites de Custo
1. Acesse o **Google Cloud Billing** > **Budgets & alerts** (Orçamentos e alertas).
2. Crie um alerta (ex.: limite de $20 USD/mês) para receber notificações por email ao atingir 50%, 80% e 100% do orçamento.
3. No painel da **Gemini API**, você pode definir quotas diárias máximas de requisições por minuto (RPM) para prevenir faturamento imprevisto.

---

## 🛡️ Checklist de Segurança Implementado

| Requisito de Segurança | Situação | Mecanismo de Proteção |
| :--- | :---: | :--- |
| Ausência de chaves no Frontend | ✅ 100% | Frontend não possui variáveis de ambiente secretas nem imports da SDK Gemini. |
| Backend Seguro com Proxy de IA | ✅ 100% | Todas as requisições passam por `/api/ai/*` com tratamento no `server.ts`. |
| Rate Limiting por IP | ✅ 100% | Limite de 15 req/min para IA e 120 req/10min para rotas gerais contra DoS. |
| Sanitização de Prompt Injection | ✅ 100% | Expressões de jailbreak e desvio de instruções são bloqueadas com HTTP 400. |
| Validação Estrita de Schemas | ✅ 100% | Zod com modo estrito (`.strict()`), rejeitando campos extras e tamanhos abusivos. |
| Mascaramento de Erros | ✅ 100% | Nenhum stack trace, detalhe interno ou env var é exposto ao cliente. |
| Conformidade com Privacidade (RGPD/LGPD) | ✅ 100% | Páginas `/privacidade` e `/termos` com endpoint de expurgo de dados (`/api/privacy/purge-data`). |
| Suíte de Testes Automatizados | ✅ 100% | Testes automatizados executados via `npm test` verificando integridade do sistema. |

---

## 📜 Licença
Software fornecido com direitos de uso e transferência comercial total para o comprador.
