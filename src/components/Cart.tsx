import { CartItem, Currency } from '../types';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  currency: Currency;
}

export function Cart({ items, onUpdateQuantity, onRemoveItem, currency }: CartProps) {
  const total = items.reduce(
    (sum, item) => sum + item.product.priceKz * item.quantity,
    0
  );

  const formatPrice = (price: number) => {
    if (currency === 'Kz') {
      return `${price.toLocaleString()} Kz`;
    }
    return `${currency} ${price.toLocaleString()}`;
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        Seu carrinho está vazio.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.product.id} className="flex gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                {item.product.image_url && (
                  <img
                    src={item.product.image_url}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <div className="flex-grow">
                <h4 className="font-semibold text-slate-900">{item.product.name}</h4>
                <p className="text-sm text-slate-500">{formatPrice(item.product.priceKz)}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center border rounded-lg">
                    <button
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                      className="p-1 hover:bg-slate-50 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 hover:bg-slate-50 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.product.id)}
                    className="text-red-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="text-right font-bold text-slate-900">
                {formatPrice(item.product.priceKz * item.quantity)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator className="my-4" />
      <div className="flex justify-between items-center text-lg font-bold text-slate-900">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
    </div>
  );
}
