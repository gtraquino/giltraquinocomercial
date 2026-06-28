# Documento de Requisitos do Produto (PRD) — GilPedidos
**Versão:** 1.0.0  
**Autor:** Gil Traquino & Equipa de Desenvolvimento  
**Data:** 28 de Junho de 2026  
**Status:** Pronto para Produção / Guia de Testes de Segurança e Qualidade  

---

## 1. Introdução e Propósito do Documento

Este Documento de Requisitos do Produto (PRD) serve como especificação formal de funcionalidade, regras de negócio, arquitetura técnica e matriz de segurança da plataforma **GilPedidos**. 

O principal objetivo deste documento é orientar **ferramentas de testes automatizados (DAST, SAST, IAST)** e **auditorias de segurança (Pentesting)** a identificar de forma eficiente possíveis falhas de segurança, vulnerabilidades de controle de acesso (BOLA/IDOR), furos lógicos na cobrança/licenciamento, e bugs de concorrência e integridade de dados na plataforma.

### 1.1 Descrição Geral do Produto
O **GilPedidos** é uma solução multi-tenant (SaaS) desenvolvida em React, TypeScript e Supabase para gerenciar pedidos de lojas e restaurantes no mercado de Angola. A plataforma permite:
1. **Clientes Finais**: Visualizar o menu/produtos, adicionar ao carrinho, realizar checkout simplificado e enviar o pedido estruturado diretamente por WhatsApp para o estabelecimento.
2. **Gerentes de Loja (Managers)**: Controlar o catálogo de produtos, categorias, níveis de stock (integrados ao campo de descrição do produto), gerenciar pedidos para relatórios e emitir facturas/recibos nos formatos PDF A4, Word (DOCX) e Ticket Térmico de 80mm de acordo com as regras de facturação da AGT de Angola (Administração Geral Tributária) vigentes em 2026.
3. **Administradores Gerais (Super Admin)**: Cadastrar novos gerentes, gerenciar bloqueios de lojas por falta de pagamento (subscrições), validar faturas e configurar dados sistémicos globais.

---

## 2. Arquitetura Técnica & Stack Tecnológica

O sistema segue uma abordagem serverless baseada em microsserviços integrados a um Backend-as-a-Service (BaaS).

```
+-------------------------------------------------------------------------+
|                              FRONT-END                                  |
|  - React 18 (Vite, TypeScript, Tailwind CSS, Shadcn UI)                |
|  - Roteamento: React Router v6                                          |
|  - Cache e Estados de Dados: TanStack React Query v5                    |
|  - Impressão/Faturação: jsPDF + jsPDF-AutoTable (PDF/Ticket) & docx     |
+-------------------------------------------------------------------------+
                                    |
                                    | Conexões HTTPS / PostgreSQL Direct
                                    v
+-------------------------------------------------------------------------+
|                              BACK-END (SUPABASE)                        |
|  - Autenticação: Supabase Auth (JWT, Row-Level Security)                 |
|  - Banco de Dados: PostgreSQL (Esquema Público Multi-tenant)            |
|  - Políticas RLS: Isolamento de dados ao nível de linha                 |
|  - Funções RPC: Validações server-side complexas e RBAC                 |
+-------------------------------------------------------------------------+
```

### 2.1 Principais Bibliotecas do Client-Side (Vulnerabilities Scanner Target)
* **`@supabase/supabase-js`**: Interação direta com a API do banco de dados PostgreSQL exposta pelo Supabase.
* **`jspdf` & `jspdf-autotable`**: Geração de faturas e tickets térmicos no navegador.
* **`docx` & `file-saver`**: Geração de ficheiros Microsoft Word para relatórios e faturas.
* **`zod` & `react-hook-form`**: Validação de formulários e integridade de inputs no lado do cliente.

---

## 3. Esquema e Dicionário do Banco de Dados (Supabase PostgreSQL)

Abaixo estão as tabelas e tipos de dados públicos mapeados que a ferramenta de testes deve inspecionar para analisar vulnerabilidades de banco de dados, injeção de comandos SQL, e integridade referencial.

### 3.1 Tabela: `stores`
Armazena a informação dos estabelecimentos cadastrados (tenants).

| Campo | Tipo | Nulidade | Descrição / Restrições |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador único e não previsível da loja. |
| `name` | `VARCHAR` | NOT NULL | Nome comercial do estabelecimento. |
| `address` | `TEXT` | NULL | Endereço físico da loja (incluído nas faturas). |
| `nif` | `VARCHAR` | NULL | NIF oficial da empresa para efeitos fiscais em Angola. |
| `type` | `VARCHAR` | NOT NULL | Tipo de estabelecimento (ex: "restaurant", "store"). |
| `whatsapp` | `VARCHAR` | NOT NULL | Telemóvel primário para envio de pedidos no WhatsApp. |
| `whatsapp_2` | `VARCHAR` | NULL | Telemóvel secundário para receber os pedidos. |
| `currency` | `VARCHAR` | NOT NULL | Moeda da loja (padrão: "AOA", "Kz"). |
| `logo_url` | `TEXT` | NULL | Link para imagem do logotipo da loja. |
| `hero_title` | `TEXT` | NULL | Texto de destaque no topo da loja. |
| `primary_color` | `VARCHAR` | NULL | Cor hexadecimal de destaque visual principal. |
| `accent_color` | `VARCHAR` | NULL | Cor hexadecimal de destaque visual secundária. |
| `opening_time` | `TIME` | NULL | Horário de abertura. |
| `closing_time` | `TIME` | NULL | Horário de encerramento. |
| `is_blocked` | `BOOLEAN` | DEFAULT false | Se verdadeiro, impede a loja de aceitar novos pedidos e bloqueia o painel do gerente. |
| `paid_until` | `TIMESTAMP` | NULL | Data de validade da subscrição da loja. |
| `subscription_amount` | `NUMERIC` | NULL | Valor de subscrição definido pelo Admin. |
| `subscription_period` | `VARCHAR` | NULL | Frequência de cobrança (ex: "monthly", "yearly"). |
| `created_by` | `UUID` | NULL | UUID do utilizador criador (Admin). |
| `created_at` | `TIMESTAMP` | NOT NULL | Data e hora de criação automática. |
| `updated_at` | `TIMESTAMP` | NOT NULL | Data e hora de atualização automática. |

### 3.2 Tabela: `products`
Gerenciamento de produtos cadastrados no catálogo das lojas.

| Campo | Tipo | Nulidade | Descrição / Restrições |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador único do produto. |
| `store_id` | `UUID` | NOT NULL (FK) | Vinculado à tabela `stores.id`. |
| `name` | `VARCHAR` | NOT NULL | Nome do produto ou prato. |
| `description` | `TEXT` | NULL | Contém a descrição comercial e a anotação de stock no formato: `Sua descrição [STOCK:15]` ou `[STOCK:unlimited]`. |
| `price` | `NUMERIC` | NOT NULL | Preço unitário do produto. |
| `category` | `VARCHAR` | NULL | Categoria para agrupar produtos (ex: "Bebidas", "Pizzas"). |
| `image_url` | `TEXT` | NULL | Link para foto do produto. |
| `in_stock` | `BOOLEAN` | DEFAULT true | Flag de disponibilidade imediata do produto no menu. |
| `created_at` | `TIMESTAMP` | NOT NULL | Data e hora de criação. |
| `updated_at` | `TIMESTAMP` | NOT NULL | Data e hora de atualização. |

### 3.3 Tabela: `orders`
Histórico de pedidos efetuados pelos utilizadores finais e salvos para relatórios.

| Campo | Tipo | Nulidade | Descrição / Restrições |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador do pedido. |
| `store_id` | `UUID` | NOT NULL (FK) | Vinculado à tabela `stores.id`. |
| `customer_name` | `VARCHAR` | NOT NULL | Nome do cliente. Para faturação nominal de gerentes, contém `Nome (NIF: XXXXXXXXX)`. |
| `customer_phone` | `VARCHAR` | NOT NULL | Contacto telefónico do cliente. |
| `items` | `JSON` | NOT NULL | Vetor de itens no formato JSON: `[{"id":"UUID","name":"Prod 1","price":1200,"qty":2}]`. |
| `total` | `NUMERIC` | NOT NULL | Somatório total do custo do pedido. |
| `currency` | `VARCHAR` | NOT NULL | Moeda utilizada (ex: "AOA"). |
| `created_at` | `TIMESTAMP` | NOT NULL | Data e hora da compra. |

### 3.4 Tabela: `store_managers`
Tabela associativa de relacionamento N:1 ou N:M que determina quais gerentes (users de autenticação) gerem quais lojas.

| Campo | Tipo | Nulidade | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador único do vínculo. |
| `store_id` | `UUID` | NOT NULL (FK) | Vinculado à tabela `stores.id`. |
| `user_id` | `UUID` | NOT NULL | Vinculado à tabela interna `auth.users.id`. |
| `created_at` | `TIMESTAMP` | NOT NULL | Data de associação. |

### 3.5 Tabela: `store_payments`
Registo de pagamentos e faturação das taxas de subscrição das lojas mantidas pelo Admin.

| Campo | Tipo | Nulidade | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador do pagamento. |
| `store_id` | `UUID` | NOT NULL (FK) | Vinculado à tabela `stores.id`. |
| `amount` | `NUMERIC` | NOT NULL | Valor monetário pago pelo gerente. |
| `period` | `VARCHAR` | NOT NULL | Período pago (ex: "Março 2026", "Mensal"). |
| `paid_at` | `TIMESTAMP` | NOT NULL | Data exata da confirmação do pagamento. |
| `covers_until` | `TIMESTAMP` | NOT NULL | Prorrogação de validade concedida com este pagamento. |
| `notes` | `TEXT` | NULL | Observações sobre o método de pagamento (ex: "IBAN Transfer"). |
| `created_by` | `UUID` | NULL | Admin que registou a transição de caixa. |
| `created_at` | `TIMESTAMP` | NOT NULL | Data de criação do log. |

### 3.6 Tabela: `user_roles`
Controle de Papéis de Utilizadores para autorizações de segurança adicionais.

| Campo | Tipo | Nulidade | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | NOT NULL (PK) | Identificador único do papel. |
| `user_id` | `UUID` | NOT NULL | UUID em `auth.users.id`. |
| `role` | `ENUM` | NOT NULL | Valores possíveis: `admin`, `user`. |

### 3.7 Funções de Banco de Dados (RPCs PostgreSQL)
As ferramentas automatizadas devem testar as seguintes funções expostas para verificar vazamentos de dados ou manipulação de permissões:
1. **`has_role(_user_id UUID, _role VARCHAR)`**: Retorna `true` se o utilizador possui o papel especificado.
2. **`is_store_manager(_store_id UUID, _user_id UUID)`**: Retorna `true` se o utilizador está associado à loja como seu gerente.
3. **`get_user_id_by_email(_email VARCHAR)`**: Retorna o ID do utilizador correspondente a partir de uma verificação de email.

---

## 4. Matriz de Controlo de Acesso & Segurança (RBAC / RLS)

A segurança do aplicativo é garantida através do **Row-Level Security (RLS)** ativo em todas as tabelas no Supabase. O descumprimento de qualquer uma destas regras deve ser sinalizado imediatamente pelo scanner automático como uma **Falha Crítica de Segurança**.

```
+------------------+-----------------------+------------------------+------------------------+
| Tabela           | Consumidor (Anónimo)  | Gerente da Loja (User) | Administrador (Admin)  |
+------------------+-----------------------+------------------------+------------------------+
| stores           | Apenas Leitura (GET)  | Ver/Editar Própria     | Acesso Total (CRUD)    |
| products         | Apenas Leitura (GET)  | Modificar Própria Loja | Acesso Total (CRUD)    |
| orders           | Apenas Criar (POST)   | Ver Própria Loja       | Acesso Total (CRUD)    |
| store_managers   | Sem Acesso (Bloqueio) | Ver Própria Relação    | Acesso Total (CRUD)    |
| store_payments   | Sem Acesso (Bloqueio) | Ver Próprio Histórico  | Acesso Total (CRUD)    |
| user_roles       | Sem Acesso (Bloqueio) | Sem Acesso             | Acesso Total (CRUD)    |
+------------------+-----------------------+------------------------+------------------------+
```

### 4.1 Políticas de Segurança PostgreSQL RLS Esperadas (Alvo de Auditoria)
* **Tabela `stores`**:
  * `SELECT`: Público (Qualquer utilizador pode abrir a loja pública).
  * `INSERT`: Apenas Admins (`has_role(auth.uid(), 'admin')`).
  * `UPDATE`: Permitido se o utilizador for Admin ou gerente autorizado (`is_store_manager(id, auth.uid())`).
  * `DELETE`: Apenas Admins.
* **Tabela `products`**:
  * `SELECT`: Público (Produtos devem estar visíveis para clientes).
  * `INSERT`, `UPDATE`, `DELETE`: Permitido apenas se o utilizador for Admin ou se for gerente autorizado da loja vinculada (`is_store_manager(store_id, auth.uid())`).
* **Tabela `orders`**:
  * `SELECT`: Permitido para Admins ou se for gerente autorizado da loja vinculada (`is_store_manager(store_id, auth.uid())`). Utilizadores anónimos/públicos **nunca** devem ler a tabela inteira de pedidos (vazamento grave de dados de clientes).
  * `INSERT`: Público (Clientes anónimos submetem pedidos).
  * `UPDATE`, `DELETE`: Apenas Admins. Gerentes não devem apagar ou alterar registos de faturamento gerados para evitar fraude de contabilidade fiscal.
* **Tabela `store_managers`**:
  * `SELECT`: Permitido apenas se for o gerente vinculado (`user_id = auth.uid()`) ou Admin.
  * `INSERT`, `UPDATE`, `DELETE`: Apenas Admins.

---

## 5. Regras de Negócio Críticas e Lógica Fiscal (AGT 2026)

A ferramenta de teste deve validar a conformidade da lógica de negócios em relação aos novos requisitos integrados para faturamento angolano em 2026.

### 5.1 Geração de Documentos Fiscais
* **NIF do Consumidor**: Se o cliente não declarar NIF, o sistema deve emitir o documento sob o nome "Consumidor Final" e com o NIF padrão de Angola `999999999`.
* **Sequência de Numeração**: As faturas devem respeitar um padrão determinístico contendo a sigla do tipo do documento (ex: `FT` para Fatura, `FR` para Fatura-Recibo), uma série (ex: `A/2026`) e um número sequencial único e irrepetível de 3 dígitos (`PREFIX A/2026-XXX`).
* **Impressão em formato Ticket (80mm)**: Destinado a impressoras térmicas. Deve ser validada a renderização dinâmica baseada no número de itens, evitando quebras de linhas ou cortes de margem na folha térmica de largura fixa (80mm).
* **Software Certificado**: Todos os PDFs/Tickets exportados devem conter a marcação de rodapé legal exigida pela AGT: `"Software certificado nº 2026/01"` e `"Processado por computador"`.
* **Cálculo de IVA e Isenção**:
  * Quando a taxa de IVA configurada for `0%`, o documento de faturamento exportado (PDF/Ticket/Word) **deve, por obrigatoriedade legal,** incluir o texto de isenção oficial angolana:  
    `"Isenção: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA."`
  * Caso o IVA seja superior a `0%`, o cálculo do subtotal, valor do imposto e total geral deve ser validado matematicamente com precisão decimal exata.

### 5.2 Lógica de Stock Embutida na Descrição
Como o GilPedidos utiliza um mecanismo de análise textual para persistir os limites de stock diretamente na descrição dos produtos, o scanner automático deve validar se:
1. Ao enviar um pedido de quantidade `X` de um produto cujo stock atual é `Y`, o valor no banco deve ser reduzido síncronamente para `Y - X` no padrão `[STOCK:(Y-X)]`.
2. Se `Y - X` for igual a `0`, o flag `in_stock` na tabela `products` deve transitar automaticamente para `false` para impedir novas vendas.
3. Se o formato estiver definido como `[STOCK:unlimited]`, o stock é ilimitado e a quantidade não se altera.
4. Qualquer padrão mal-formatado (ex: `[STOCK:abc]`) deve ser mitigado com segurança para evitar erros de execução do script (crash).

---

## 6. Cenários de Ataque e Alvos de Testes Automatizados (Vulnerability Scanning Target List)

Esta seção lista os principais vetores de vulnerabilidades potenciais da aplicação que o sistema de testes automatizados deve tentar explorar.

### 6.1 BOLA / IDOR (Broken Object Level Authorization)
* **Vetor de Teste**: Submeter um request `HTTP PATCH` ou `DELETE` para `https://<supabase-url>/rest/v1/products?id=eq.<ID-De-Outra-Loja>` com um token JWT de um utilizador autenticado como gerente de uma loja diferente.
* **Resultado Esperado**: O Supabase deve retornar status `200` mas afetando `0` registos (ou erro `403 Forbidden`) devido à barreira do RLS que confere `is_store_manager(store_id, auth.uid())`.

### 6.2 Bypass de Bloqueio de Loja (Licenciamento SaaS)
* **Vetor de Teste**: Tentar alterar o campo `is_blocked` para `false` na tabela `stores` a partir da conta de um gerente regular.
* **Resultado Esperado**: Erro de violação de políticas de atualização do RLS da tabela `stores`, que restringe modificações desta flag apenas para administradores do sistema.
* **Vetor de Teste 2**: Realizar pedidos via API pública para uma loja onde `is_blocked = true` ou `paid_until` seja menor do que a data atual.
* **Resultado Esperado**: O sistema não deve processar a inserção de pedidos ou recusar compras com erros adequados no e-commerce público.

### 6.3 Concorrência e Esgotamento Súbito de Stock (Race Conditions)
* **Vetor de Teste**: Efetuar múltiplos requests de checkout paralelos simultâneos para o mesmo item cujo stock é limitado e está prestes a esgotar (ex: 2 unidades em stock, tentar comprar 2 unidades simultaneamente através de 3 sessões de clientes simultâneas).
* **Resultado Esperado**: O sistema de gestão de transações ou lógica concorrente deve impedir que o stock assuma um valor negativo e garantir a consistência das vendas finais.

### 6.4 Injeção SQL e Escapamento de Caracteres Especiais
* **Vetor de Teste**: Introduzir caracteres de injeção sql comuns no nome de produtos ou nas configurações do nome da empresa de faturamento (ex: `' OR '1'='1` ou `"; DROP TABLE stores; --`).
* **Resultado Esperado**: Tratamento e parametrização segura por meio da engine PostgREST / Supabase e jsPDF, sem falhas lógicas no parseamento ou execução das consultas.

### 6.5 Injeção XSS e Manipulação de Arquivos Exportados (Word e PDF)
* **Vetor de Teste**: Registar um pedido informando o nome do cliente contendo tags HTML e scripts JS maliciosos (ex: `<script>alert('xss')</script>` ou injeção de fórmulas CSV/Word como `=cmd|' /C calc'!A1`).
* **Resultado Esperado**: O jsPDF, jsPDF-AutoTable e o gerador de DOCX devem escapar de forma limpa esses blocos de texto no momento de renderizar a fatura e o ticket, tratando o conteúdo como texto plano seguro e evitando qualquer execução remota de código (RCE).

---

## 7. Cenários de Testes em Formato Gherkin (Para QA & Automação BDD)

Estes cenários foram concebidos para facilitar a escrita direta de scripts de teste automatizados em ferramentas como **Playwright, Cypress, Selenium ou Cucumber**.

### Cenário 1: Tentativa maliciosa de exclusão de produto de outra loja (IDOR)
```gherkin
Funcionalidade: Controle de Acesso e Isolamento Multi-tenant
  Como um Gerente de Loja Malicioso autenticado no sistema
  Quero tentar excluir um produto que pertence à loja de outro gerente
  Para testar a segurança do isolamento de dados (RLS)

  Contexto:
    Dado que estou autenticado com as credenciais do "Gerente A" na Loja "Loja A"
    E existe um produto cadastrado com ID "999eb3c9-959c-4977-8321-7db13daff22e" pertencente à "Loja B"

  Cenário: Tentativa de remoção direta via requisição HTTP de API
    Quando envio uma requisição HTTP DELETE para a tabela de produtos onde o ID do produto é igual a "999eb3c9-959c-4977-8321-7db13daff22e"
    Então o sistema deve recusar a operação
    E deve retornar um código de status HTTP "403 Forbidden" ou realizar uma atualização vazia (0 linhas modificadas)
    E o produto da "Loja B" deve continuar existindo intacto no banco de dados
```

### Cenário 2: Validação de dedução correta do Stock no momento do Checkout
```gherkin
Funcionalidade: Integridade lógica e Consistência de Stock
  Como um Cliente final no e-commerce de uma loja
  Quero comprar um item com quantidade limitada
  Para garantir que a dedução lógica e transição de estado de stock acontecem de forma correta e síncrona

  Cenário: Compra reduz stock e desativa item quando chega a zero
    Dado que a loja "Loja de Teste" possui um produto "Hambúrguer Especial" cadastrado
    E o campo de descrição do produto contém "[STOCK:1]"
    E o produto está marcado com o flag de disponibilidade "in_stock" igual a "true"
    Quando eu adiciono "1" unidade de "Hambúrguer Especial" ao carrinho
    E realizo o checkout preenchendo o Nome "Cliente Teste" e Contacto "923000000"
    Então um novo pedido deve ser inserido com sucesso na tabela de faturamento "orders"
    E a descrição do produto "Hambúrguer Especial" no banco de dados deve ser alterada de forma limpa para "[STOCK:0]"
    E o flag de disponibilidade "in_stock" do produto correspondente deve transitar de forma síncrona para "false"
```

### Cenário 3: Impressão de Factura com IVA Isento segundo a Legislação Angolana (AGT 2026)
```gherkin
Funcionalidade: Conformidade Fiscal e Emissão de Faturas
  Como um Gerente de Loja utilizando o InvoicingManager
  Quero emitir e exportar uma factura em formato PDF/Ticket com taxa de IVA igual a zero
  Para certificar-me que os dados e menções de isenção fiscal exigidos por lei são renderizados corretamente

  Cenário: Emissão de Fatura Isenta em formato Ticket 80mm
    Dado que a configuração do IVA da loja está definida como "0%" (Isento)
    E o gerente seleciona o formato de impressão "Ticket (80mm)"
    Quando o gerente solicita a emissão do documento fiscal de um pedido
    Então o sistema deve gerar e descarregar um arquivo no formato PDF com tamanho de papel adaptivo de 80mm
    E o documento gerado deve exibir a identificação da série no formato "Série de Facturação: A/2026"
    E o documento deve exibir o texto de isenção regulamentar da AGT: "Isenção: Isento ao abrigo do nº 1 do Artigo 12.º do Código do IVA."
    E o documento deve obrigatoriamente exibir a assinatura MD5 simulada e a declaração "Software certificado nº 2026/01".
```

---
**Fim do Documento de Requisitos do Produto (PRD) — GilPedidos**
