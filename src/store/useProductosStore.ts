import { create } from 'zustand';
import axios from 'axios';

export interface Producto {
  id: number;
  name: string;
  list_price: number;
  default_code: string;
}

interface ProductosState {
  productos: Producto[];
  pagina: number;
  hasMas: boolean;
  loading: boolean;
  fetchProductos: (append?: boolean) => Promise<void>;
  resetProductos: () => void;
}

export const useProductosStore = create<ProductosState>((set, get) => ({
  productos: [],
  pagina: 0,
  hasMas: true,
  loading: false,

  fetchProductos: async (append = false) => {
    const { pagina, productos } = get();
    const LIMITE = 20;

    set({ loading: true });

    try {
      const res = await axios.get('https://app-sb-production.up.railway.app/productos', {
        params: {
          limit: LIMITE,
          offset: append ? pagina * LIMITE : 0,
        },
      });

      const nuevos = Array.isArray(res.data) ? res.data : [];

      set({
        productos: append ? [...productos, ...nuevos] : nuevos,
        pagina: append ? pagina + 1 : 1,
        hasMas: nuevos.length === LIMITE,
      });
    } catch (e) {
      console.error('❌ Error en useProductosStore', e);
    } finally {
      set({ loading: false });
    }
  },

  resetProductos: () => {
    set({
      productos: [],
      pagina: 0,
      hasMas: true,
      loading: false,
    });
  },
}));