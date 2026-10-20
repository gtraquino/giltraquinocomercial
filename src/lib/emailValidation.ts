/**
 * Utilitário de validação rigorosa de endereços de email.
 * Previne envios para emails fictícios, inválidos ou com gralhas tipográficas comuns,
 * eliminando devoluções (bounces) no Supabase.
 */

// Domínios fictícios, descartáveis ou de teste conhecidos que geram bounces imediatos
const BLOCKED_DOMAINS = new Set([
  "teste.com",
  "teste.pt",
  "teste.ao",
  "test.com",
  "test.pt",
  "test.ao",
  "exemplo.com",
  "example.com",
  "example.org",
  "example.net",
  "fake.com",
  "fake.org",
  "tempmail.com",
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "throwawaymail.com",
  "yopmail.com",
  "dispostable.com",
]);

// Erros comuns de digitação em domínios populares
const DOMAIN_TYPO_MAP: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaik.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlool.com": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
};

export interface EmailValidationResult {
  isValid: boolean;
  normalizedEmail: string;
  error?: string;
  suggestedDomain?: string;
}

/**
 * Valida se um email é bem formatado e seguro para envio de comunicações transacionais.
 */
export function validateEmail(input: string): EmailValidationResult {
  if (!input || typeof input !== "string") {
    return { isValid: false, normalizedEmail: "", error: "Introduza um endereço de email." };
  }

  const clean = input.trim().toLowerCase();

  // 1. Verificação básica de comprimento
  if (clean.length < 5 || clean.length > 254) {
    return { isValid: false, normalizedEmail: clean, error: "O tamanho do email é inválido." };
  }

  // 2. Verificação de formato RFC 5322 simplificado
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) {
    return { isValid: false, normalizedEmail: clean, error: "Formato de email inválido. Verifique o endereço introduzido." };
  }

  const parts = clean.split("@");
  if (parts.length !== 2) {
    return { isValid: false, normalizedEmail: clean, error: "Email inválido." };
  }

  const [localPart, domain] = parts;

  if (localPart.length === 0 || domain.length === 0) {
    return { isValid: false, normalizedEmail: clean, error: "Email incompleto." };
  }

  // 3. Verificar extensão (TLD)
  const domainParts = domain.split(".");
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return { isValid: false, normalizedEmail: clean, error: "Domínio de email inválido (ex: .com, .pt, .ao)." };
  }

  // 4. Bloquear domínios de teste ou descartáveis conhecidos
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      isValid: false,
      normalizedEmail: clean,
      error: `Não são permitidos emails com o domínio "${domain}". Por favor utilize um email real existente.`,
    };
  }

  // 5. Sugestão / aviso de gralha comum (ex: gmai.com -> gmail.com)
  if (DOMAIN_TYPO_MAP[domain]) {
    const suggestedDomain = DOMAIN_TYPO_MAP[domain];
    return {
      isValid: false,
      normalizedEmail: clean,
      suggestedDomain,
      error: `Possível erro de digitação no domínio: quis dizer "@${suggestedDomain}" em vez de "@${domain}"?`,
    };
  }

  return { isValid: true, normalizedEmail: clean };
}
