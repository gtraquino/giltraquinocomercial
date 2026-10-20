import { CartItem, OrderDetails, Currency } from '../types';

/**
 * Normaliza um número de telefone para o formato internacional aceito pelo WhatsApp.
 * Se tiver 9 dígitos (ex: padrão Angola 9xx xxx xxx ou 2xx xxx xxx), adiciona automaticamente o prefixo 244.
 */
export function normalizeWhatsAppNumber(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Se começar com 00, remove o 00 inicial internacional
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Se começar com indicativo de Angola 244 seguido de 0 (ex: 2440923123456)
  if (digits.startsWith("2440") && digits.length === 13) {
    digits = `244${digits.slice(4)}`;
  }

  // Se tiver 10 dígitos e começar por 0 (ex: 0923123456 formato local)
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Se tiver 9 dígitos (número padrão angolano), prefixa com o código internacional 244
  if (digits.length === 9) {
    return `244${digits}`;
  }

  return digits;
}

export function generateWhatsAppMessage(
  items: CartItem[],
  details: OrderDetails,
  currency: Currency
): string {
  const itemsList = items
    .map(
      (item) =>
        `• ${item.quantity}x ${item.product.name} - ${
          currency === 'Kz'
            ? `${(item.product.priceKz * item.quantity).toLocaleString()} Kz`
            : `${currency} ${(item.product.priceKz * item.quantity).toLocaleString()}`
        }`
    )
    .join('\n');

  const total = items.reduce(
    (sum, item) => sum + item.product.priceKz * item.quantity,
    0
  );

  const message = `
*Novo Pedido - GilPedidos*
--------------------------
*Cliente:* ${details.name}
*Telefone:* ${details.phone}
*Endereço:* ${details.address}
*Pagamento:* ${details.paymentMethod}
${details.notes ? `*Notas:* ${details.notes}` : ''}

*Itens:*
${itemsList}

*Total:* ${
    currency === 'Kz'
      ? `${total.toLocaleString()} Kz`
      : `${currency} ${total.toLocaleString()}`
  }
--------------------------
Pedido realizado via GilPedidos
`.trim();

  return encodeURIComponent(message);
}

export function sendWhatsAppOrder(message: string, phone: string) {
  const cleanPhone = normalizeWhatsAppNumber(phone);
  const url = `https://wa.me/${cleanPhone}?text=${message}`;
  window.open(url, '_blank');
}
