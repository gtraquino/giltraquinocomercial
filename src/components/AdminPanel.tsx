import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Plus, Utensils, Package } from 'lucide-react';
import { createRestaurant, addProduct, getRestaurants } from '../services/restaurantService';
import { Restaurant } from '../types';
import { toast } from 'sonner';

interface AdminPanelProps {
  onRestaurantCreated: () => void;
}

export function AdminPanel({ onRestaurantCreated }: AdminPanelProps) {
  const [isRestaurantModalOpen, setIsRestaurantModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  
  const [newRestaurant, setNewRestaurant] = useState({
    name: '',
    description: '',
    whatsapp: '',
    image_url: '',
    category: '',
    address: ''
  });

  const [newProduct, setNewProduct] = useState({
    restaurant_id: '',
    name: '',
    description: '',
    price_kz: 0,
    category: '',
    image_url: ''
  });

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRestaurant(newRestaurant);
      toast.success('Restaurante criado com sucesso!');
      setIsRestaurantModalOpen(false);
      setNewRestaurant({ name: '', description: '', whatsapp: '', image_url: '', category: '', address: '' });
      onRestaurantCreated();
    } catch (error: any) {
      console.error('Error creating restaurant:', error);
      let message = 'Erro ao criar restaurante';
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error.includes('insufficient permissions')) {
          message = 'Sem permissão. Verifique se você é o admin.';
        }
      } catch (e) {}
      toast.error(message);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addProduct(newProduct);
      toast.success('Produto adicionado com sucesso!');
      setIsProductModalOpen(false);
      setNewProduct({ restaurant_id: '', name: '', description: '', price_kz: 0, category: '', image_url: '' });
    } catch (error: any) {
      console.error('Error adding product:', error);
      let message = 'Erro ao adicionar produto';
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error.includes('insufficient permissions')) {
          message = 'Sem permissão. Verifique se você é o admin.';
        }
      } catch (e) {}
      toast.error(message);
    }
  };

  const loadRestaurantsForProduct = async () => {
    const data = await getRestaurants();
    setRestaurants(data);
  };

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-[100]">
      <Dialog open={isRestaurantModalOpen} onOpenChange={setIsRestaurantModalOpen}>
        <DialogTrigger render={<Button className="rounded-full w-14 h-14 shadow-xl bg-slate-900 hover:bg-slate-800" />}>
          <Utensils size={24} />
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Restaurante</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRestaurant} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input required value={newRestaurant.name} onChange={e => setNewRestaurant({...newRestaurant, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (Ex: 2449xxxxxxxx)</Label>
              <Input required value={newRestaurant.whatsapp} onChange={e => setNewRestaurant({...newRestaurant, whatsapp: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={newRestaurant.description} onChange={e => setNewRestaurant({...newRestaurant, description: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input value={newRestaurant.image_url} onChange={e => setNewRestaurant({...newRestaurant, image_url: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={newRestaurant.category} onChange={e => setNewRestaurant({...newRestaurant, category: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={newRestaurant.address} onChange={e => setNewRestaurant({...newRestaurant, address: e.target.value})} />
            </div>
            <Button type="submit" className="w-full">Salvar Restaurante</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isProductModalOpen} onOpenChange={(open) => {
        setIsProductModalOpen(open);
        if (open) loadRestaurantsForProduct();
      }}>
        <DialogTrigger render={<Button className="rounded-full w-14 h-14 shadow-xl bg-blue-600 hover:bg-blue-700" />}>
          <Package size={24} />
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Restaurante</Label>
              <select 
                required 
                className="w-full p-2 border rounded-md"
                value={newProduct.restaurant_id}
                onChange={e => setNewProduct({...newProduct, restaurant_id: e.target.value})}
              >
                <option value="">Selecione um restaurante</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nome do Produto</Label>
              <Input required value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Preço (Kz)</Label>
              <Input required type="number" value={newProduct.price_kz} onChange={e => setNewProduct({...newProduct, price_kz: Number(e.target.value)})} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input value={newProduct.image_url} onChange={e => setNewProduct({...newProduct, image_url: e.target.value})} />
            </div>
            <Button type="submit" className="w-full">Adicionar Produto</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
