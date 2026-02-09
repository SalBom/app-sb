export type RootStackParamList = {
    Login: undefined;
    Menu: undefined;
    MainTabs: undefined;
    FacturaPDF: { url: string; facturaId: string }; // Agregar facturaId aquí
    ProductoDetalle: { id: number };
    DashboardVendedor: undefined;
    Descargas: undefined; 
    TableroVendedor: undefined;
    Facturas: undefined;
    Pedidos: undefined;
    EditUser: undefined;
    ListadoClientes: { estadoId: string };
    FacturasVendedor: undefined;
    AdminPanel: undefined;
    GestionUsuarios: undefined;
    AdminPromociones: undefined;
    AdminNuevaPromo: undefined;
    DashboardAdministrador: undefined;
    AdminBanners: undefined;
    AdminPlazos: undefined;
    Favoritos: undefined;
};  