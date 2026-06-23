import React, { useState } from 'react';
import { CartItem, OrderDetails, Currency } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

// Need to add RadioGroup and Textarea to shadcn
interface CheckoutFormProps {
  cartItems: CartItem[];
  onSubmit: (details: OrderDetails) => void;
  currency: Currency;
}

export function CheckoutForm({ cartItems, onSubmit, currency }: CheckoutFormProps) {
  const [formData, setFormData] = useState<OrderDetails>({
    name: '',
    phone: '',
    address: '',
    notes: '',
    paymentMethod: 'cash',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const total = cartItems.reduce(
    (sum, item) => sum + item.product.priceKz * item.quantity,
    0
  );

  const formatPrice = (price: number) => {
    if (currency === 'Kz') {
      return `${price.toLocaleString()} Kz`;
    }
    return `${currency} ${price.toLocaleString()}`;
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome Completo</Label>
          <Input
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Como devemos te chamar?"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefone / WhatsApp</Label>
          <Input
            id="phone"
            required
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="9xx xxx xxx"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Endereço de Entrega</Label>
          <Input
            id="address"
            required
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Rua, Bairro, Ponto de Referência"
          />
        </div>

        <div className="space-y-2">
          <Label>Forma de Pagamento</Label>
          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="payment"
                value="cash"
                checked={formData.paymentMethod === 'cash'}
                onChange={() => setFormData({ ...formData, paymentMethod: 'cash' })}
                className="w-4 h-4 text-blue-600"
              />
              <span>Dinheiro</span>
            </label>
            <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="payment"
                value="multicaixa"
                checked={formData.paymentMethod === 'multicaixa'}
                onChange={() => setFormData({ ...formData, paymentMethod: 'multicaixa' })}
                className="w-4 h-4 text-blue-600"
              />
              <span>Multicaixa (TPA)</span>
            </label>
            <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="payment"
                value="transfer"
                checked={formData.paymentMethod === 'transfer'}
                onChange={() => setFormData({ ...formData, paymentMethod: 'transfer' })}
                className="w-4 h-4 text-blue-600"
              />
              <span>Transferência / IBAN</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Observações (Opcional)</Label>
          <textarea
            id="notes"
            className="w-full min-h-[100px] p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Ex: Sem cebola, campainha não funciona..."
          />
        </div>
      </div>

      <Button type="submit" className="w-full h-12 text-lg font-bold bg-green-600 hover:bg-green-700">
        Enviar Pedido via WhatsApp ({formatPrice(total)})
      </Button>
    </form>
  );
}
