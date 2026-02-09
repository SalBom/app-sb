import { create } from 'zustand';
import type { ProductoBase } from './cartStore';

interface Favorito extends ProductoBase {
  id: number;
}

interface FavoritesState {
  favorites: Favorito[];
  addFavorite: (producto: Favorito) => void;
  removeFavorite: (productId: number) => void;
  isFavorite: (productId: number) => boolean;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],

  addFavorite: (producto) =>
    set((state) => {
      if (state.favorites.some((p) => p.id === producto.id)) return state;
      return { favorites: [...state.favorites, producto] };
    }),

  removeFavorite: (productId) =>
    set((state) => ({
      favorites: state.favorites.filter((p) => p.id !== productId),
    })),

  isFavorite: (productId) =>
    get().favorites.some((p) => p.id === productId),
}));
