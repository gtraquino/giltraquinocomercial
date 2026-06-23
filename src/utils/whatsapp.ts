import { CartItem, OrderDetails, Currency } from '../types';

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
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${message}`;
  window.open(url, '_blank');
}
