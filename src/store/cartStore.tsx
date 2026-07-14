import { create } from 'zustand';
import axios from 'axios';
import { getCuitFromStorage } from '../utils/authStorage';
import { API_URL } from '../config'; 

// --- FUNCIÓN PARA GUARDAR EN LA NUBE ---
const syncCartToBackend = async (items: any[]) => {
    try {
        const cuit = await getCuitFromStorage();
        if (cuit) {
            axios.post(`${API_URL}/cart/save`, { cuit, items }).catch(() => {});
        }
    } catch (e) {}
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

// AMPLIAMOS EL TIPO CLIENTE PARA GUARDAR TODOS SUS DATOS
export type ClienteSel = { 
  id: number; 
  name: string; 
  display_name?: string; 
  vat?: string | null;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  transport_data?: { id: number; name: string } | null;
  is_self?: boolean;
};

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
  list_price: number;
  product_uom_qty: number;
  discount1?: number;
  discount2?: number;
  discount3?: number;
  image_thumb_url?: string | null;
  payment_term_id?: number; 
  corte_por_bulto?: string | null;
};

export type ProductoCarrito = ProductoBase & {
  product_uom_qty: number;
  payment_term_id: number; 
};

export const PRODUCTO_TRANSPORTE_ID = 33627;

type CartState = {
  items: ProductoCarrito[];
  clienteSeleccionado: ClienteSel | null;
  plazoSeleccionado: PlazoSel | null;
  envioSeleccionado: MetodoEnvio | null;
  direccionEntrega: DireccionEntrega | null;
  
  // --- VARIABLES IMPORTANTES PARA EL TRANSPORTE ---
  transporte: any | null;         
  transporteAsignado: string | null;
  notas: string | null;           
  // ------------------------------------------------
  
  consultaResumen: ConsultaResumen | null;
  orderId: number | null;

  setItems: (items: ProductoCarrito[]) => void; 
  addToCart: (product: ProductoBase) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateDiscount: (productId: number, descuentos: { discount1?: number; discount2?: number; discount3?: number }) => void;
  updateItemPaymentTerm: (productId: number, termId: number) => void;
  setGlobalPaymentTerm: (term: PlazoSel) => void;
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
  setTransporteObj: (t: any | null) => void;   
  setNotas: (n: string | null) => void;        

  addOrUpdateTransporteItem: (label?: string, priceUSD?: number) => void;
  removeTransporteItem: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  clienteSeleccionado: null,
  plazoSeleccionado: null,
  envioSeleccionado: null,
  direccionEntrega: null,
  
  transporte: null,         
  transporteAsignado: null,
  notas: null,              
  
  consultaResumen: null,
  orderId: null,

  setItems: (newItems: ProductoCarrito[]) => {
      set({ items: newItems });
      get().updateMaxPaymentTerm();
  },

  updateMaxPaymentTerm: () => {
    const { items } = get();
    if (items.length === 0) { set({ plazoSeleccionado: null }); return; }
    const itemsParaPlazo = items.filter(it => it.product_id !== PRODUCTO_TRANSPORTE_ID);
    if (itemsParaPlazo.length === 0) { set({ plazoSeleccionado: null }); return; }
    const maxId = Math.max(...itemsParaPlazo.map(it => it.payment_term_id || 0));
    set({ plazoSeleccionado: { id: maxId } });
  },

  addToCart: (product) => {
    set((state) => {
      const exists = state.items.find((it) => it.product_id === product.product_id);
      let newItems;
      if (exists) {
        if (product.product_id === PRODUCTO_TRANSPORTE_ID) return { items: state.items };
        newItems = state.items.map((it) => it.product_id === product.product_id ? { ...it, product_uom_qty: it.product_uom_qty + 1 } : it);
      } else {
        newItems = [...state.items, { ...product, product_uom_qty: product.product_uom_qty ?? 1, payment_term_id: product.payment_term_id ?? 1 }];
      }
      syncCartToBackend(newItems);
      return { items: newItems };
    });
    get().updateMaxPaymentTerm();
  },

  updateQuantity: (productId, quantity) => {
    set((state) => {
      const newItems = state.items.map((item) => item.product_id === productId ? { ...item, product_uom_qty: quantity } : item);
      syncCartToBackend(newItems);
      return { items: newItems };
    });
  },

  updateDiscount: (productId, descuentos) =>
    set((state) => {
      const newItems = state.items.map((item) => item.product_id === productId ? { ...item, ...descuentos } : item);
      syncCartToBackend(newItems);
      return { items: newItems };
    }),

  updateItemPaymentTerm: (productId, termId) => {
    set((state) => {
        const newItems = state.items.map((item) => item.product_id === productId ? { ...item, payment_term_id: termId } : item);
        syncCartToBackend(newItems);
        return { items: newItems };
    });
    get().updateMaxPaymentTerm();
  },

  // Plazo de pago GENERAL del pedido: aplica el mismo term_id a todos los ítems
  // (así la lógica de descuentos por ítem, que lee item.payment_term_id, queda
  // idéntica) y fija plazoSeleccionado, que es lo que viaja como payment_term_id
  // a nivel de la orden en el paso 3.
  setGlobalPaymentTerm: (term) => {
    set((state) => {
      const newItems = state.items.map((item) =>
        item.product_id === PRODUCTO_TRANSPORTE_ID ? item : { ...item, payment_term_id: term.id }
      );
      syncCartToBackend(newItems);
      return { items: newItems, plazoSeleccionado: term };
    });
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
        items: [], clienteSeleccionado: null, plazoSeleccionado: null, envioSeleccionado: null, direccionEntrega: null, 
        transporte: null, transporteAsignado: null, notas: null, consultaResumen: null, orderId: null 
      });
      syncCartToBackend([]); 
  },

  getQuantity: (productId) => { const it = get().items.find((x) => x.product_id === productId); return it ? it.product_uom_qty : 0; },
  setCliente: (c) => set({ clienteSeleccionado: c }),
  setPlazo: (p) => set({ plazoSeleccionado: p }),
  setEnvio: (m) => set({ envioSeleccionado: m }),
  setDireccionEntrega: (d) => set({ direccionEntrega: d }),
  setConsultaResumen: (r) => set({ consultaResumen: r }),
  setOrderId: (id) => set({ orderId: id }),
  setTransporte: (nombre) => set({ transporteAsignado: nombre }),
  setTransporteObj: (t) => set({ transporte: t }),
  setNotas: (n) => set({ notas: n }),

  addOrUpdateTransporteItem: (label = 'ENVÍO A DOMICILIO', priceUSD = 0) =>
    set((state) => {
      const exists = state.items.find((it) => it.product_id === PRODUCTO_TRANSPORTE_ID);
      const baseItem: ProductoCarrito = { product_id: PRODUCTO_TRANSPORTE_ID, name: label, default_code: 'TRANSPORTE', price_unit: priceUSD, list_price: priceUSD, product_uom_qty: 1, payment_term_id: 1 };
      let newItems = exists 
        ? state.items.map((it) => it.product_id === PRODUCTO_TRANSPORTE_ID ? { ...it, name: label, price_unit: priceUSD, list_price: priceUSD } : it) 
        : [...state.items, baseItem];
      syncCartToBackend(newItems);
      return { items: newItems };
    }),

  removeTransporteItem: () => set((state) => {
      const newItems = state.items.filter((it) => it.product_id !== PRODUCTO_TRANSPORTE_ID);
      syncCartToBackend(newItems);
      return { items: newItems };
  }),
}));