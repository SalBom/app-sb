import { create } from 'zustand';
import axios from 'axios';
import { Alert } from 'react-native';
import { getCuitFromStorage } from '../utils/authStorage';
import { API_URL } from '../config'; 

// --- FUNCIÓN PARA GUARDAR EN LA NUBE ---
const syncCartToBackend = async (items: any[]) => {
    try {
        const cuit = await getCuitFromStorage();
        if (cuit) {
            // Enviamos al backend sin esperar respuesta
            axios.post(`${API_URL}/cart/save`, {
                cuit: cuit,
                items: items
            }).catch(() => {
                // Silenciamos errores de red en background para no spamear la consola
                // Si es crítico, el usuario lo notará al no ver sus items en otro lado.
            });
        }
    } catch (e) {
        // Error accediendo al storage local, no es crítico para mostrar en consola prod
    }
};

export type DireccionEntrega = {
  id?: number | string;
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  source?: 'partner' | 'delivery_child';
};

export type ClienteSel = { id: number; name: string; display_name?: string; vat?: string | null };
export type PlazoSel   = { id: number; nombre?: string; name?: string };
export type MetodoEnvio = 'sucursal' | 'domicilio';

export type ConsultaResumen = {
  consulta_id: number;
  name: string;
  currency: string;
  base_imponible: number;
  total: number;
  tax_totals?: any;
};

export type ProductoBase = {
  product_id: number;
  name: string;
  price_unit: number;
  default_code: string;
  image_128?: string;
  list_price: number;
  product_uom_qty: number;
  discount1?: number;
  discount2?: number;
  discount3?: number;
  image_thumb_url?: string | null;
  image_md_url?: string | null;
  image_1920?: string | null;
  payment_term_id?: number; 
};

export type ProductoCarrito = ProductoBase & {
  product_uom_qty: number;
  payment_term_id: number; 
};

export const PRODUCTO_TRANSPORTE_ID = 4011;

type CartState = {
  items: ProductoCarrito[];
  clienteSeleccionado: ClienteSel | null;
  plazoSeleccionado: PlazoSel | null;
  envioSeleccionado: MetodoEnvio | null;
  direccionEntrega: DireccionEntrega | null;
  transporteAsignado: string | null;
  consultaResumen: ConsultaResumen | null;
  orderId: number | null;

  setItems: (items: ProductoCarrito[]) => void; 
  addToCart: (product: ProductoBase) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateDiscount: (productId: number, descuentos: { discount1?: number; discount2?: number; discount3?: number }) => void;
  updateItemPaymentTerm: (productId: number, termId: number) => void; 
  updateMaxPaymentTerm: () => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  getQuantity: (productId: number) => number;
  setCliente: (c: ClienteSel | null) => void;
  setPlazo: (p: PlazoSel | null) => void;
  setEnvio: (m: MetodoEnvio | null) => void;
  setDireccionEntrega: (d: DireccionEntrega | null) => void;
  setConsultaResumen: (r: ConsultaResumen | null) => void;
  setOrderId: (id: number | null) => void;
  setTransporte: (nombre: string | null) => void;
  addOrUpdateTransporteItem: (label?: string, priceUSD?: number) => void;
  removeTransporteItem: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  clienteSeleccionado: null,
  plazoSeleccionado: null,
  envioSeleccionado: null,
  direccionEntrega: null,
  transporteAsignado: null,
  consultaResumen: null,
  orderId: null,

  setItems: (newItems: ProductoCarrito[]) => {
      set({ items: newItems });
      get().updateMaxPaymentTerm();
  },

  updateMaxPaymentTerm: () => {
    const { items } = get();
    if (items.length === 0) {
      set({ plazoSeleccionado: null });
      return;
    }
    const itemsParaPlazo = items.filter(it => it.product_id !== PRODUCTO_TRANSPORTE_ID);
    if (itemsParaPlazo.length === 0) {
        set({ plazoSeleccionado: null });
        return;
    }

    const maxId = Math.max(...itemsParaPlazo.map(it => it.payment_term_id || 0));
    set({ plazoSeleccionado: { id: maxId } });
  },

  addToCart: (product) => {
    set((state) => {
      const exists = state.items.find((it) => it.product_id === product.product_id);
      let newItems;

      if (exists) {
        if (product.product_id === PRODUCTO_TRANSPORTE_ID) return { items: state.items };
        newItems = state.items.map((it) =>
            it.product_id === product.product_id
              ? { ...it, product_uom_qty: it.product_uom_qty + 1 }
              : it
          );
      } else {
        newItems = [
          ...state.items,
          {
            ...product,
            product_uom_qty: product.product_uom_qty ?? 1,
            payment_term_id: product.payment_term_id ?? 1, 
          },
        ];
      }
      syncCartToBackend(newItems);
      return { items: newItems };
    });
    get().updateMaxPaymentTerm();
  },

  updateQuantity: (productId, quantity) => {
    set((state) => {
      const newItems = state.items.map((item) =>
        item.product_id === productId ? { ...item, product_uom_qty: quantity } : item
      );
      syncCartToBackend(newItems);
      return { items: newItems };
    });
  },

  updateDiscount: (productId, descuentos) =>
    set((state) => {
      const newItems = state.items.map((item) =>
        item.product_id === productId
          ? { ...item, ...descuentos }
          : item
      );
      syncCartToBackend(newItems);
      return { items: newItems };
    }),

  updateItemPaymentTerm: (productId, termId) => {
    set((state) => {
        const newItems = state.items.map((item) => 
            item.product_id === productId ? { ...item, payment_term_id: termId } : item
        );
        syncCartToBackend(newItems);
        return { items: newItems };
    });
    get().updateMaxPaymentTerm();
  },

  removeFromCart: (productId) => {
    set((state) => {
      const newItems = state.items.filter((item) => item.product_id !== productId);
      syncCartToBackend(newItems);
      return { items: newItems };
    });
    get().updateMaxPaymentTerm();
  },

  clearCart: () => {
      set({ 
        items: [], 
        clienteSeleccionado: null, 
        plazoSeleccionado: null, 
        envioSeleccionado: null, 
        direccionEntrega: null, 
        transporteAsignado: null, 
        consultaResumen: null, 
        orderId: null 
      });
      syncCartToBackend([]); 
  },

  getQuantity: (productId) => {
    const it = get().items.find((x) => x.product_id === productId);
    return it ? it.product_uom_qty : 0;
  },

  setCliente: (c) => set({ clienteSeleccionado: c }),
  setPlazo: (p) => set({ plazoSeleccionado: p }),
  setEnvio: (m) => set({ envioSeleccionado: m }),
  setDireccionEntrega: (d) => set({ direccionEntrega: d }),
  setConsultaResumen: (r) => set({ consultaResumen: r }),
  setOrderId: (id) => set({ orderId: id }),
  setTransporte: (nombre) => set({ transporteAsignado: nombre }),

  addOrUpdateTransporteItem: (label = 'ENVÍO A DOMICILIO', priceUSD = 0) =>
    set((state) => {
      const exists = state.items.find((it) => it.product_id === PRODUCTO_TRANSPORTE_ID);
      const baseItem: ProductoCarrito = {
        product_id: PRODUCTO_TRANSPORTE_ID,
        name: label,
        default_code: 'TRANSPORTE',
        price_unit: priceUSD,
        list_price: priceUSD,
        product_uom_qty: 1,
        payment_term_id: 1,
      };
      
      let newItems;
      if (exists) {
        newItems = state.items.map((it) =>
            it.product_id === PRODUCTO_TRANSPORTE_ID
              ? { ...it, name: label, price_unit: priceUSD, list_price: priceUSD }
              : it
          );
      } else {
        newItems = [...state.items, baseItem];
      }
      
      syncCartToBackend(newItems);
      return { items: newItems };
    }),

  removeTransporteItem: () => set((state) => {
      const newItems = state.items.filter((it) => it.product_id !== PRODUCTO_TRANSPORTE_ID);
      syncCartToBackend(newItems);
      return { items: newItems };
  }),
}));