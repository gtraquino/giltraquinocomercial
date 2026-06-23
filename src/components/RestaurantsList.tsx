import { useEffect, useState } from 'react';
import { Restaurant } from '../types';
import { getRestaurants } from '../services/restaurantService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Phone, Utensils } from 'lucide-react';

interface RestaurantsListProps {
  onSelectRestaurant: (restaurant: Restaurant) => void;
}

export function RestaurantsList({ onSelectRestaurant }: RestaurantsListProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getRestaurants();
        setRestaurants(data);
      } catch (error) {
        console.error('Error loading restaurants:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-500">
        Carregando restaurantes...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center mb-12 text-center">
        <div className="bg-blue-600 p-4 rounded-2xl mb-4 shadow-lg shadow-blue-200">
          <Utensils className="text-white" size={40} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2">GilPedidos</h1>
        <p className="text-slate-500 max-w-md">
          Escolha seu restaurante favorito e faça seu pedido de forma rápida e simples.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {restaurants.map((restaurant) => (
          <Card
            key={restaurant.id}
            className="group cursor-pointer hover:shadow-xl transition-all border-slate-200 overflow-hidden"
            onClick={() => onSelectRestaurant(restaurant)}
          >
            <div className="aspect-video relative overflow-hidden bg-slate-100">
              {restaurant.image_url ? (
                <img
                  src={restaurant.image_url}
                  alt={restaurant.name}
                  className="object-cover w-full h-full transition-transform group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  Sem imagem
                </div>
              )}
              <div className="absolute top-4 right-4">
                <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-blue-600 shadow-sm">
                  {restaurant.category || 'Restaurante'}
                </span>
              </div>
            </div>
            <CardHeader className="p-6">
              <CardTitle className="text-2xl font-bold group-hover:text-blue-600 transition-colors">
                {restaurant.name}
              </CardTitle>
              <p className="text-slate-500 line-clamp-2 text-sm mt-2">
                {restaurant.description || 'Nenhuma descrição disponível.'}
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0 space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin size={16} className="text-slate-400" />
                <span>{restaurant.address || 'Endereço não informado'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={16} className="text-slate-400" />
                <span>{restaurant.whatsapp}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {restaurants.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
          <p className="text-slate-500">Nenhum restaurante cadastrado ainda.</p>
        </div>
      )}
    </div>
  );
}
