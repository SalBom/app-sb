// src/navigation/linking.ts
// Sincroniza la navegación con el historial del navegador (History API) en web.
// Sin esto, React Navigation nunca llama a history.pushState: solo existe la
// entrada inicial de carga de la página, así que el botón "atrás" del navegador
// sale de toda la app en vez de retroceder una pantalla dentro de ella.
//
// `prefixes: []` deja el comportamiento nativo (deep links por esquema URL)
// exactamente igual que antes — la app no tiene un esquema propio configurado,
// así que esto no afecta mobile. En web, React Navigation usa el origen actual
// automáticamente sin necesitar un prefix.
//
// `ProductoDetalle` está registrado en DOS navegadores distintos (uno raíz,
// usado desde Home/Favoritos; otro anidado dentro de la pila de Productos), por
// eso tienen rutas distintas acá para no generar ambigüedad al resolver URLs.
//
// ⚠️ IMPORTANTE: la RAÍZ ('') NO se mapea a ninguna pantalla a propósito.
// El acceso vs. login se decide en AppNavigator con `initialRouteName`
// (Login si no hay sesión, MainTabs si la hay). Si acá mapeáramos '' → Home,
// esa coincidencia de URL le GANARÍA al initialRouteName y todo visitante
// entraría directo al Home aunque no tenga sesión. Al dejar '' sin mapear,
// visitar `/` no matchea nada y React Navigation cae en el initialRouteName
// (el gating de sesión), manteniendo igual los deep links del resto de pantallas.
import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Login: 'login',
      FacturaPDF: 'factura-pdf',
      ProductoDetalle: 'producto/:id',
      DashboardVendedor: 'dashboard-vendedor',
      Descargas: 'descargas',
      TableroVendedor: 'tablero-vendedor',
      Facturas: 'facturas',
      Pedidos: 'pedidos',
      EditUser: 'editar-perfil',
      ListadoClientes: 'clientes/:estadoId',
      FacturasVendedor: 'facturas-vendedor',
      AdminPanel: 'admin',
      GestionUsuarios: 'admin/usuarios',
      AdminPromociones: 'admin/promociones',
      AdminNuevaPromo: 'admin/promociones/nueva',
      DashboardAdministrador: 'admin/dashboard',
      AdminBanners: 'admin/banners',
      AdminPlazos: 'admin/plazos',
      MainTabs: {
        // Sin `path` propio y con Home en '/home' (NO en la raíz ''): así la raíz
        // '/' NO matchea nada y queda a cargo del initialRouteName (gating de
        // sesión). Las tabs conservan su URL para que el botón "atrás" funcione.
        screens: {
          Home: 'home',
          Carrito: 'carrito',
          MisVentas: 'ofertas',
          Perfil: 'perfil',
          Favoritos: 'favoritos',
          Productos: {
            path: 'productos',
            screens: {
              ProductosList: '',
              ProductoDetalle: ':id',
            },
          },
        },
      },
    },
  },
};

export default linking;
