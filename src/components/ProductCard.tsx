import React from 'react';
import { Product, Currency } from '../types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onAddToCart: () => void;
  currency: Currency;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart, currency }) => {
  const formatPrice = (price: number) => {
    if (currency === 'Kz') {
      return `${price.toLocaleString()} Kz`;
    }
    return `${currency} ${price.toLocaleString()}`;
  };

  return (
    <Card className="overflow-hidden flex flex-col h-full">
      <div className="aspect-square relative overflow-hidden bg-slate-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="object-cover w-full h-full transition-transform hover:scale-105"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            Sem imagem
          </div>
        )}
      </div>
      <CardHeader className="p-4">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-bold leading-tight">{product.name}</CardTitle>
          <span className="text-blue-600 font-bold whitespace-nowrap">
            {formatPrice(product.priceKz)}
          </span>
        </div>
        <p className="text-sm text-slate-500 line-clamp-2 mt-1">{product.description}</p>
      </CardHeader>
      <CardFooter className="p-4 mt-auto pt-0">
        <Button onClick={onAddToCart} className="w-full gap-2">
          <ShoppingCart size={18} />
          Adicionar
        </Button>
      </CardFooter>
    </Card>
  );
}
