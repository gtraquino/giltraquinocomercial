export type Currency = 'Kz' | 'USD' | 'EUR';

export interface Product {
  id: string;
  name: string;
  description: string;
  priceKz: number;
  category: string;
  image_url?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderDetails {
  name: string;
  phone: string;
  address: string;
  notes?: string;
  paymentMethod: 'cash' | 'transfer' | 'multicaixa';
}

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  whatsapp: string;
  image_url?: string;
  category?: string;
  address?: string;
}

export interface RestaurantProduct {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  price_kz: number;
  category: string;
  image_url?: string;
}
