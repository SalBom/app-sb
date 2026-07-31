// src/screens/pedidos.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  Linking,
  Alert,
  Platform,
  Modal,
  Pressable,
  ScrollView
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; 

import authStorage from '../utils/authStorage';
import FlechaHeaderSvg from '../../assets/flechaHeader.svg';
import ContenedorFacturaSvg from '../../assets/contenedorFactura.svg'; 
import FlechaPedidoSvg from '../../assets/flechaPedido.svg';

import { API_URL } from '../config';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';
import { useCartStore } from '../store/cartStore';

type PedidoItem = {
  pedido_id?: number;
  numero_pedido: string;
  cliente: string;
  fecha: string;
  total: number;
  estado: string;
  estado_facturacion?: string;
  invoice_status?: string;
  moneda?: string | null;
};

type PedidoDetalleLine =
  | { type: 'section'; name: string }
  | {
      type: 'line'; name: string; qty: number; price_unit: number;
      discount1: number; discount2: number; discount3: number;
      subtotal: number; impuesto: number; total: number;
    };

type PedidoDetalle = {
  pedido_id: number;
  numero_pedido: string;
  estado: string;
  fecha: string;
  cliente: { id: number; name: string } | null;
  payment_term_name: string | null;
  moneda: string | null;
  carrier_name: string | null;
  direccion_envio: { name: string; street: string; city: string } | null;
  nota: string | null;
  base_imponible: number;
  impuestos: number;
  total: number;
  items: PedidoDetalleLine[];
};

const PAGE_SIZE = 20;

// Opciones para los filtros
const ESTADOS_OPCIONES = [
  { label: 'TODOS LOS ESTADOS', value: '' },
  { label: 'PRESUPUESTO', value: 'draft' },
  { label: 'CONFIRMADO', value: 'sale' },
  { label: 'CANCELADO', value: 'cancel' }
];

const FACTURACION_OPCIONES = [
  { label: 'FACTURACIÓN: TODAS', value: '' },
  { label: 'FACTURADO', value: 'invoiced' },
  { label: 'A FACTURAR', value: 'to invoice' },
  { label: 'NADA A FACTURAR', value: 'no' }
];

const Pedidos: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isDesktopWeb = useIsDesktopWeb();
  const { cuitOverride } = route.params || {};

  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  
  // Filtro Estado
  const [statusFilter, setStatusFilter] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false); 

  // Filtro Facturación (NUEVO)
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Filtro Fecha
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Ver Detalle (solo lectura, cualquier estado)
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<PedidoDetalle | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); 
    if (event.type === 'set' && selectedDate) {
      setDateFilter(selectedDate);
      setShowDatePicker(false); 
    } else {
        setShowDatePicker(false);
    }
  };

  const clearDateFilter = () => setDateFilter(null);
  const displayDate = dateFilter ? dateFilter.toLocaleDateString('es-AR') : '';

  const getBaseUrl = () => {
    const rawBaseUrl = API_URL;
    return rawBaseUrl.replace(/\/+$/, '');
  };

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchPedidos = async (currentOffset: number, isRefresh = false) => {
    try {
      const cuit = cuitOverride || await authStorage.getCuitFromStorage();
      if (!cuit) {
        setError('No se encontró CUIT.');
        setLoadingInitial(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      const baseUrl = getBaseUrl();
      let url = `${baseUrl}/mis_pedidos?cuit=${encodeURIComponent(cuit)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;
      
      if (search.trim()) url += `&q=${encodeURIComponent(search.trim())}`;
      if (dateFilter) url += `&date=${formatDateForBackend(dateFilter)}`;
      if (statusFilter.trim()) url += `&state=${encodeURIComponent(statusFilter.trim())}`;
      
      // NUEVO PARÁMETRO EN LA URL
      if (invoiceFilter.trim()) url += `&invoice_status=${encodeURIComponent(invoiceFilter.trim())}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'Error al cargar pedidos');

      const newItems = (json?.items || []) as PedidoItem[];

      if (isRefresh) {
        setPedidos(newItems);
      } else {
        setPedidos(prev => [...prev, ...newItems]);
      }

      setHasMore(newItems.length >= PAGE_SIZE);

    } catch (e: any) {
      console.log('Error fetching pedidos:', e);
      setError('Error de conexión.');
    } finally {
      setLoadingInitial(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPedidos(0, true); }, []);

  // Agregamos invoiceFilter al arreglo de dependencias
  useEffect(() => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          setLoadingInitial(true); 
          setOffset(0); 
          setHasMore(true);
          fetchPedidos(0, true); 
      }, 500);
      return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [search, dateFilter, statusFilter, invoiceFilter]); 

  const onRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    setOffset(0);
    fetchPedidos(0, true);
  };

  const loadMore = () => {
    const isFiltering = (search.trim() !== '') || (dateFilter !== null) || (statusFilter.trim() !== '') || (invoiceFilter.trim() !== '');
    if (isFiltering) return; 
    if (!hasMore || loadingMore || loadingInitial || refreshing) return;
    setLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchPedidos(newOffset, false);
  };

  // Aviso que se ve en las DOS plataformas: react-native-web no renderiza
  // Alert.alert, así que en la web los mensajes quedaban invisibles.
  const avisar = (msg: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(msg);
    } else {
      Alert.alert('Aviso', msg);
    }
  };

  // El backend devuelve el PDF en bytes (no un JSON con una URL), así que lo
  // abrimos directo: el navegador / visor del celular lo descarga solo. Antes
  // se hacía res.json() sobre el PDF y siempre reventaba.
  const handleDownloadPdf = async (item: PedidoItem) => {
    const idPedido = item?.pedido_id;
    if (!idPedido) {
      avisar('No se pudo identificar el pedido para descargarlo.');
      return;
    }
    try {
        const baseUrl = getBaseUrl();
        // Se manda el ID NUMÉRICO: Odoo arma el reporte con eso, no con el
        // número de pedido visible.
        const url = `${baseUrl}/pedido_pdf?id=${encodeURIComponent(String(idPedido))}`;
        const ok = await Linking.canOpenURL(url);
        if (!ok) { avisar('No se pudo abrir el PDF en este dispositivo.'); return; }
        await Linking.openURL(url);
    } catch (e) { avisar('No se pudo descargar el PDF. Intentá de nuevo.'); }
  };

  // ───────────────────────── Cancelar Pedido (solo PRESUPUESTO) ─────────────────────────
  const handleCancelOrder = (item: PedidoItem) => {
    if (item.estado !== 'draft' && item.estado !== 'sent') {
      Alert.alert('Aviso', 'Solo se pueden cancelar pedidos en estado PRESUPUESTO.');
      return;
    }

    Alert.alert(
      'Cancelar Pedido',
      `¿Confirmás la cancelación del pedido ${item.numero_pedido}? Esta acción también lo cancela en el sistema.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar Pedido',
          style: 'destructive',
          onPress: async () => {
            try {
              const cuit = cuitOverride || await authStorage.getCuitFromStorage();
              const baseUrl = getBaseUrl();
              const res = await fetch(`${baseUrl}/cancelar_pedido`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pedido_id: item.pedido_id,
                  cuit,
                }),
              });
              const json = await res.json();
              if (!res.ok) {
                Alert.alert('No se pudo cancelar', json?.error || 'Error desconocido.');
                return;
              }
              // Actualizamos el estado localmente para que la tarjeta se re-renderice
              setPedidos(prev =>
                prev.map(p =>
                  p.numero_pedido === item.numero_pedido ? { ...p, estado: 'cancel' } : p
                )
              );
              Alert.alert('Listo', 'El pedido fue cancelado.');
            } catch (e) {
              Alert.alert('Error', 'No se pudo cancelar el pedido. Intentá nuevamente.');
            }
          },
        },
      ]
    );
  };

  // ───────────────────────── Editar Pedido (solo PRESUPUESTO) ─────────────────────────
  // Reutiliza el flujo del carrito: precarga el pedido (items, cliente, plazo) en el
  // store, marca orderId para que el paso 3 ACTUALICE ese pedido (order_id_to_update)
  // en vez de crear uno nuevo, y navega al carrito para agregar/quitar items y cambiar
  // cliente/plazo con la misma UI de siempre.
  const handleEditOrder = async (item: PedidoItem) => {
    if (item.estado !== 'draft' && item.estado !== 'sent') {
      Alert.alert('Aviso', 'Solo se pueden editar pedidos en estado PRESUPUESTO.');
      return;
    }
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/pedido/${item.pedido_id}/detalle-edicion`);
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('No se puede editar', json?.error || 'No se pudo cargar el pedido.');
        return;
      }

      const cartItems = (json.items || []).map((it: any) => ({
        product_id: it.product_id,
        name: it.name,
        price_unit: Number(it.price_unit) || 0,
        default_code: it.default_code || '',
        list_price: Number(it.list_price) || 0,
        product_uom_qty: Number(it.product_uom_qty) || 1,
        discount1: Number(it.discount1) || 0,
        discount2: Number(it.discount2) || 0,
        discount3: Number(it.discount3) || 0,
        payment_term_id: it.payment_term_id || 1,
        image_thumb_url: null,
      }));

      const store = useCartStore.getState();
      // Limpiamos estado de envío/observaciones de una edición/sesión previa,
      // sin perder el pedido que estamos por cargar.
      store.setEnvio(null);
      store.setTransporteObj(null);
      store.setTransporte(null);
      store.setDireccionEntrega(null);
      store.setNotas(null);
      store.setConsultaResumen(null);

      store.setItems(cartItems);
      if (json.cliente) {
        store.setCliente({ id: json.cliente.id, name: json.cliente.name, vat: json.cliente.vat });
      }
      if (json.payment_term_id) {
        store.setPlazo({ id: json.payment_term_id, nombre: json.payment_term_name });
      }
      store.setOrderId(item.pedido_id ?? null);

      navigation.navigate('MainTabs', { screen: 'Carrito' });
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar el pedido para editar.');
    }
  };

  // ───────────────────────── Ver Detalle (cualquier estado) ─────────────────────────
  const handleViewDetail = async (item: PedidoItem) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/pedido/${item.pedido_id}/detalle`);
      const json = await res.json();
      if (!res.ok) {
        setDetailError(json?.error || 'No se pudo cargar el detalle del pedido.');
        return;
      }
      setDetailData(json as PedidoDetalle);
    } catch (e) {
      setDetailError('Error de conexión.');
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetail = () => { setDetailVisible(false); setDetailData(null); setDetailError(null); };

  const formatCurrency = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Muestra el total en la moneda en la que está cargado el pedido (ej. "USD 1.234,56").
  const formatMonto = (item: PedidoItem) => `${item.moneda ? item.moneda + ' ' : '$ '}${formatCurrency(item.total)}`;
  
  const getEstadoInfo = (estado: string) => {
    switch (estado) {
        case 'sale': case 'done': return { label: 'CONFIRMADO', color: '#4CAF50' };
        case 'draft': case 'sent': return { label: 'PRESUPUESTO', color: '#9E9E9E' };
        case 'cancel': return { label: 'CANCELADO', color: '#CC0000' };
        default: return { label: estado.toUpperCase(), color: '#9E9E9E' };
    }
  };

  const getFacturacionInfo = (estadoFact?: string) => {
    const estado = estadoFact ? estadoFact.toLowerCase() : 'no';
    switch (estado) {
        case 'invoiced': case 'facturado': return { label: 'FACTURADO', color: '#1C9BD8' }; // Azul
        case 'to invoice': case 'a_facturar': return { label: 'A FACTURAR', color: '#F59E0B' }; // Naranja
        case 'no': return { label: 'NADA A FACTURAR', color: '#757575' }; // Gris
        default: return { label: estado.toUpperCase(), color: '#757575' };
    }
  };

  const formatFecha = (f: string) => (!f || f === 'Sin fecha' ? '---' : f.split(' ')[0]);

  const renderItem = ({ item }: { item: PedidoItem }) => {
    const estadoInfo = getEstadoInfo(item.estado);
    // Ahora forzamos que si no viene nada, tome valor por defecto, así SIEMPRE renderiza la etiqueta
    const rawInvStatus = item.estado_facturacion || item.invoice_status || 'no'; 
    const facturacionInfo = getFacturacionInfo(rawInvStatus);

    const isPresupuesto = item.estado === 'draft' || item.estado === 'sent';

    return (
      <View style={s.cardContainer}>
          <ContenedorFacturaSvg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none"/>
          <View style={s.cardContent}>
              <View style={s.cardHeaderRow}>
                  <View style={s.flechaTagContainer}>
                      <FlechaPedidoSvg width={200} height={40} style={StyleSheet.absoluteFill} preserveAspectRatio="none"/>
                      <Text style={s.tagText} numberOfLines={1}>{item.numero_pedido.replace('S', 'PEDIDO #')}</Text>
                  </View>
              </View>
              <View style={s.cardBody}>
                  <View style={s.infoColumn}>
                      <Text style={s.infoRow}><Text style={s.label}>CLIENTE: </Text><Text style={s.value} numberOfLines={1}>{item.cliente}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>FECHA: </Text><Text style={s.value}>{formatFecha(item.fecha)}</Text></Text>
                      <Text style={s.infoRow}><Text style={s.label}>TOTAL: </Text><Text style={s.value}>{formatMonto(item)}</Text></Text>
                  </View>
                  <View style={s.statusColumn}>
                      {/* Estado del Pedido */}
                      <View style={[s.badge, { backgroundColor: estadoInfo.color }]}>
                          <Text style={s.badgeText}>{estadoInfo.label}</Text>
                      </View>
                      
                      {/* Estado de Facturación (Aparece siempre) */}
                      <View style={[s.badge, { backgroundColor: facturacionInfo.color, marginTop: 4 }]}>
                          <Text style={s.badgeText}>{facturacionInfo.label}</Text>
                      </View>

                      <View style={s.actionsRow}>
                          <TouchableOpacity style={s.iconButton} onPress={() => handleDownloadPdf(item)}>
                              <Feather name="download" size={20} color="#2B2B2B" />
                          </TouchableOpacity>

                          {isPresupuesto && (
                              <TouchableOpacity style={s.iconButton} onPress={() => handleEditOrder(item)}>
                                  <Feather name="edit-2" size={20} color="#1C9BD8" />
                              </TouchableOpacity>
                          )}

                          {isPresupuesto && (
                              <TouchableOpacity style={s.iconButton} onPress={() => handleCancelOrder(item)}>
                                  <Feather name="x-circle" size={20} color="#CC0000" />
                              </TouchableOpacity>
                          )}

                          <TouchableOpacity style={s.iconButton} onPress={() => handleViewDetail(item)}>
                              <Feather name="eye" size={20} color="#2B2B2B" />
                          </TouchableOpacity>
                      </View>
                  </View>
              </View>
          </View>
      </View>
    );
  };

  const renderFooter = () => {
    const isFiltering = (search.trim() !== '') || (dateFilter !== null) || (statusFilter.trim() !== '') || (invoiceFilter.trim() !== '');
    if (isFiltering || !loadingMore) return <View style={{ height: 20 }} />;
    return <View style={{ paddingVertical: 20 }}><ActivityIndicator size="small" color="#0088CC" /></View>;
  };

  const filterModals = (
    <>
      {/* MODAL DE ESTADOS */}
      <Modal visible={showStatusModal} animationType="fade" transparent>
        <View style={[s.modalBackdrop, isDesktopWeb && ds.modalBackdropD]}>
          <View style={[s.modalCard, isDesktopWeb && ds.modalCardD]}>
            <Text style={s.modalTitle}>Filtrar por Estado</Text>
            <FlatList
                data={ESTADOS_OPCIONES}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                    <Pressable
                        style={[s.modalItem, statusFilter === item.value && s.modalItemSelected]}
                        onPress={() => {
                            setStatusFilter(item.value);
                            setShowStatusModal(false);
                        }}
                    >
                        <Text style={[s.modalItemText, statusFilter === item.value && s.modalItemTextSelected]}>
                            {item.label}
                        </Text>
                        {statusFilter === item.value && <Ionicons name="checkmark-circle" size={20} color="#1C9BD8" />}
                    </Pressable>
                )}
            />
            <Pressable style={s.modalClose} onPress={() => setShowStatusModal(false)}>
                <Text style={s.modalCloseText}>CERRAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL DE FACTURACIÓN */}
      <Modal visible={showInvoiceModal} animationType="fade" transparent>
        <View style={[s.modalBackdrop, isDesktopWeb && ds.modalBackdropD]}>
          <View style={[s.modalCard, isDesktopWeb && ds.modalCardD]}>
            <Text style={s.modalTitle}>Filtrar por Facturación</Text>
            <FlatList
                data={FACTURACION_OPCIONES}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                    <Pressable
                        style={[s.modalItem, invoiceFilter === item.value && s.modalItemSelected]}
                        onPress={() => {
                            setInvoiceFilter(item.value);
                            setShowInvoiceModal(false);
                        }}
                    >
                        <Text style={[s.modalItemText, invoiceFilter === item.value && s.modalItemTextSelected]}>
                            {item.label}
                        </Text>
                        {invoiceFilter === item.value && <Ionicons name="checkmark-circle" size={20} color="#1C9BD8" />}
                    </Pressable>
                )}
            />
            <Pressable style={s.modalClose} onPress={() => setShowInvoiceModal(false)}>
                <Text style={s.modalCloseText}>CERRAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );

  // Modal de "ver detalle": funciona para pedidos en CUALQUIER estado (a diferencia
  // de la edición, que solo permite presupuestos). Muestra las líneas tal como están
  // en Odoo, incluidas las secciones (ej. "[LISTA DE PRECIOS] 30/60/90").
  const detailModal = (
    <Modal visible={detailVisible} animationType={isDesktopWeb ? 'fade' : 'slide'} transparent onRequestClose={closeDetail}>
      <View style={isDesktopWeb ? ds.detailBackdropD : s.modalBackdrop}>
        <View style={isDesktopWeb ? ds.detailCardD : s.detailCardMobile}>
          <View style={ds.detailHeaderRow}>
            <Text style={ds.detailHeaderTitle} numberOfLines={1}>
              {detailData ? detailData.numero_pedido.replace('S', 'PEDIDO #') : 'Detalle del pedido'}
            </Text>
            <TouchableOpacity onPress={closeDetail} hitSlop={10}>
              <Feather name="x" size={22} color="#2B2B2B" />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <ActivityIndicator size="large" color="#0088CC" style={{ marginVertical: 50 }} />
          ) : detailError ? (
            <Text style={ds.detailErrorText}>{detailError}</Text>
          ) : detailData ? (
            <ScrollView style={ds.detailScroll} showsVerticalScrollIndicator={false}>
              <View style={[s.badge, { backgroundColor: getEstadoInfo(detailData.estado).color, alignSelf: 'flex-start', marginBottom: 14 }]}>
                <Text style={s.badgeText}>{getEstadoInfo(detailData.estado).label}</Text>
              </View>

              <View style={ds.detailRow}><Text style={ds.detailLabel}>Cliente:</Text><Text style={ds.detailValue}>{detailData.cliente?.name || '—'}</Text></View>
              <View style={ds.detailRow}><Text style={ds.detailLabel}>Fecha:</Text><Text style={ds.detailValue}>{formatFecha(detailData.fecha)}</Text></View>
              <View style={ds.detailRow}><Text style={ds.detailLabel}>Plazo de pago:</Text><Text style={ds.detailValue}>{detailData.payment_term_name || '—'}</Text></View>
              {!!detailData.carrier_name && (
                <View style={ds.detailRow}><Text style={ds.detailLabel}>Transporte:</Text><Text style={ds.detailValue}>{detailData.carrier_name}</Text></View>
              )}
              {!!detailData.direccion_envio && (
                <View style={ds.detailRow}>
                  <Text style={ds.detailLabel}>Envío a:</Text>
                  <Text style={ds.detailValue}>{[detailData.direccion_envio.street, detailData.direccion_envio.city].filter(Boolean).join(', ') || detailData.direccion_envio.name}</Text>
                </View>
              )}
              {!!detailData.nota && (
                <View style={ds.detailRow}><Text style={ds.detailLabel}>Nota:</Text><Text style={ds.detailValue}>{detailData.nota}</Text></View>
              )}

              <View style={ds.detailDivider} />

              <View style={ds.itemsHeadRow}>
                <Text style={[ds.itemsHeadText, { flex: 1.8 }]}>PRODUCTO</Text>
                <Text style={[ds.itemsHeadText, { flex: 0.5, textAlign: 'center' }]}>CANT</Text>
                <Text style={[ds.itemsHeadText, { flex: 0.9, textAlign: 'right' }]}>PRECIO</Text>
                <Text style={[ds.itemsHeadText, { flex: 0.6, textAlign: 'center' }]}>DTO</Text>
                <Text style={[ds.itemsHeadText, { flex: 0.9, textAlign: 'right' }]}>SUBTOTAL</Text>
              </View>

              {detailData.items.map((line, idx) => line.type === 'section' ? (
                <Text key={idx} style={ds.sectionTitle}>{line.name}</Text>
              ) : (
                <View key={idx} style={ds.itemRow}>
                  <Text style={[ds.itemName, { flex: 1.8 }]} numberOfLines={2}>{line.name}</Text>
                  <Text style={[ds.itemCell, { flex: 0.5, textAlign: 'center' }]}>x{line.qty}</Text>
                  <Text style={[ds.itemCell, { flex: 0.9, textAlign: 'right' }]}>{detailData.moneda || ''} {formatCurrency(line.price_unit)}</Text>
                  <Text style={[ds.itemCell, { flex: 0.6, textAlign: 'center', color: '#1C9BD8' }]}>
                    {[line.discount1, line.discount2, line.discount3].filter(d => d > 0).join('+') || '-'}
                    {[line.discount1, line.discount2, line.discount3].some(d => d > 0) ? '%' : ''}
                  </Text>
                  <Text style={[ds.itemCell, { flex: 0.9, textAlign: 'right', fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' }]}>{detailData.moneda || ''} {formatCurrency(line.subtotal)}</Text>
                </View>
              ))}

              <View style={ds.detailDivider} />
              <View style={ds.taxRow}>
                <Text style={ds.taxLabel}>Base imponible</Text>
                <Text style={ds.taxValue}>{detailData.moneda || ''} {formatCurrency(detailData.base_imponible)}</Text>
              </View>
              <View style={ds.taxRow}>
                <Text style={ds.taxLabel}>Impuestos</Text>
                <Text style={ds.taxValue}>{detailData.moneda || ''} {formatCurrency(detailData.impuestos)}</Text>
              </View>
              <View style={ds.detailDivider} />
              <View style={ds.totalRow}>
                <Text style={ds.totalLabel}>TOTAL</Text>
                <Text style={ds.totalValue}>{detailData.moneda || ''} {formatCurrency(detailData.total)}</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const renderRowD = (item: PedidoItem, idx: number) => {
    const estadoInfo = getEstadoInfo(item.estado);
    const rawInvStatus = item.estado_facturacion || item.invoice_status || 'no';
    const facturacionInfo = getFacturacionInfo(rawInvStatus);
    const isPresupuesto = item.estado === 'draft' || item.estado === 'sent';

    return (
      <View key={item.numero_pedido + idx} style={ds.row}>
        <Text style={[ds.rowCell, { flex: 1.4, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' }]}>{item.numero_pedido.replace('S', 'PEDIDO #')}</Text>
        <Text style={[ds.rowCell, { flex: 1.8 }]} numberOfLines={1}>{item.cliente}</Text>
        <Text style={[ds.rowCell, { flex: 1 }]}>{formatFecha(item.fecha)}</Text>
        <Text style={[ds.rowCell, { flex: 1, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B' }]}>{formatMonto(item)}</Text>
        <View style={{ flex: 1.4, flexDirection: 'row', gap: 6 }}>
          <View style={[ds.badge, { backgroundColor: estadoInfo.color }]}><Text style={ds.badgeText}>{estadoInfo.label}</Text></View>
          <View style={[ds.badge, { backgroundColor: facturacionInfo.color }]}><Text style={ds.badgeText}>{facturacionInfo.label}</Text></View>
        </View>
        <View style={{ flex: 0.6, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
          <TouchableOpacity onPress={() => handleViewDetail(item)}><Feather name="eye" size={18} color="#2B2B2B" /></TouchableOpacity>
          <TouchableOpacity onPress={() => handleDownloadPdf(item)}><Feather name="download" size={18} color="#2B2B2B" /></TouchableOpacity>
          {isPresupuesto && (
            <TouchableOpacity onPress={() => handleEditOrder(item)}><Feather name="edit-2" size={18} color="#1C9BD8" /></TouchableOpacity>
          )}
          {isPresupuesto && (
            <TouchableOpacity onPress={() => handleCancelOrder(item)}><Feather name="x-circle" size={18} color="#CC0000" /></TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ===========================================================================
  // VERSIÓN DESKTOP WEB
  // ===========================================================================
  if (isDesktopWeb) {
    return (
      <View style={ds.screen}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={ds.page}>
            <Text style={ds.pageTitle}>PEDIDOS</Text>

            <View style={ds.filtersRow}>
              <View style={ds.searchInputWrap}>
                <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
                <TextInput style={ds.searchInput} placeholder="Buscar..." placeholderTextColor="#999" value={search} onChangeText={setSearch} />
              </View>
              <TouchableOpacity style={ds.filterBtn} onPress={() => setShowDatePicker(true)}>
                <Feather name="calendar" size={14} color="#666" />
                <Text style={[ds.filterText, !dateFilter && { color: '#999' }]} numberOfLines={1}>{dateFilter ? displayDate : 'Fecha'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ds.filterBtn} onPress={() => setShowStatusModal(true)}>
                <Text style={[ds.filterText, !statusFilter && { color: '#999' }]} numberOfLines={1}>{ESTADOS_OPCIONES.find(e => e.value === statusFilter)?.label || 'Estado'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ds.filterBtn} onPress={() => setShowInvoiceModal(true)}>
                <Text style={[ds.filterText, !invoiceFilter && { color: '#999' }]} numberOfLines={1}>{FACTURACION_OPCIONES.find(e => e.value === invoiceFilter)?.label || 'Facturación'}</Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && <DateTimePicker value={dateFilter || new Date()} mode="date" display="default" onChange={onChangeDate} maximumDate={new Date()} />}

            {loadingInitial ? (
              <ActivityIndicator size="large" color="#0088CC" style={{ marginTop: 40 }} />
            ) : error ? (
              <Text style={ds.emptyText}>{error}</Text>
            ) : pedidos.length === 0 ? (
              <Text style={ds.emptyText}>No se encontraron pedidos.</Text>
            ) : (
              <View style={ds.table}>
                <View style={ds.tableHeadRow}>
                  <Text style={[ds.th, { flex: 1.4 }]}>NÚMERO</Text>
                  <Text style={[ds.th, { flex: 1.8 }]}>CLIENTE</Text>
                  <Text style={[ds.th, { flex: 1 }]}>FECHA</Text>
                  <Text style={[ds.th, { flex: 1 }]}>TOTAL</Text>
                  <Text style={[ds.th, { flex: 1.4 }]}>ESTADO</Text>
                  <View style={{ flex: 0.6 }} />
                </View>
                {pedidos.map(renderRowD)}
                {hasMore && !(search.trim() || dateFilter || statusFilter || invoiceFilter) && (
                  <TouchableOpacity onPress={loadMore} style={ds.loadMoreBtn}>
                    {loadingMore ? <ActivityIndicator size="small" color="#1C9BD8" /> : <Text style={ds.loadMoreText}>Cargar más...</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </ScrollView>
        {filterModals}
        {detailModal}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 8}}>
            <FlechaHeaderSvg width={50} height={36} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PEDIDOS</Text>
      </View>

      <View style={s.filtersContainer}>
        <View style={s.searchRow}>
           <View style={s.searchInputWrap}>
              <TextInput style={s.searchInput} placeholder="BUSCAR" placeholderTextColor="#999" value={search} onChangeText={setSearch}/>
              <Ionicons name="search" size={20} color="#999" style={s.searchIcon} />
           </View>
        </View>
        <View style={s.filtersRow}>
            {/* Filtro Fecha */}
            <TouchableOpacity style={[s.filterInputWrap, { marginRight: 6, flexDirection: 'row', alignItems: 'center' }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[s.filterInput, !dateFilter && { color: '#999' }]} numberOfLines={1}>{dateFilter ? displayDate : "FECHA"}</Text>
                {dateFilter && <TouchableOpacity onPress={clearDateFilter} style={{ padding: 2 }}><Ionicons name="close-circle" size={16} color="#999" /></TouchableOpacity>}
            </TouchableOpacity>
            
            {/* Filtro Estado */}
            <TouchableOpacity 
                style={[s.filterInputWrap, { marginRight: 6, flexDirection: 'row', alignItems: 'center' }]} 
                onPress={() => setShowStatusModal(true)}
            >
                <Text style={[s.filterInput, !statusFilter && { color: '#999' }]} numberOfLines={1}>
                    {ESTADOS_OPCIONES.find(e => e.value === statusFilter)?.label || "ESTADO"}
                </Text>
                {statusFilter !== '' && (
                    <TouchableOpacity onPress={() => setStatusFilter('')} style={{ padding: 2 }}>
                        <Ionicons name="close-circle" size={16} color="#999" />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>

            {/* Filtro Facturación (NUEVO) */}
            <TouchableOpacity 
                style={[s.filterInputWrap, { flexDirection: 'row', alignItems: 'center' }]} 
                onPress={() => setShowInvoiceModal(true)}
            >
                <Text style={[s.filterInput, !invoiceFilter && { color: '#999' }]} numberOfLines={1}>
                    {FACTURACION_OPCIONES.find(e => e.value === invoiceFilter)?.label || "FACTURA"}
                </Text>
                {invoiceFilter !== '' && (
                    <TouchableOpacity onPress={() => setInvoiceFilter('')} style={{ padding: 2 }}>
                        <Ionicons name="close-circle" size={16} color="#999" />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        </View>
      </View>

      {showDatePicker && <DateTimePicker value={dateFilter || new Date()} mode="date" display="default" onChange={onChangeDate} maximumDate={new Date()} />}

      {filterModals}

      {loadingInitial ? (
          <ActivityIndicator size="large" color="#0088CC" style={{ marginTop: 40 }} />
      ) : (
          <FlatList
            data={pedidos}
            keyExtractor={(item, index) => item.numero_pedido + index}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            onRefresh={onRefresh}
            refreshing={refreshing}
            ListEmptyComponent={!loadingInitial && !error ? <Text style={s.emptyText}>No se encontraron pedidos.</Text> : null}
          />
      )}
      {error && <Text style={s.errorText}>{error}</Text>}
      {detailModal}
    </View>
  );
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 10, backgroundColor: '#FAFAFA', zIndex: 10 },
  headerTitle: { fontSize: 28, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', textTransform: 'uppercase' },
  filtersContainer: { paddingHorizontal: 16, marginBottom: 10, backgroundColor: '#FAFAFA', paddingBottom: 5 },
  searchRow: { marginBottom: 8 },
  searchInputWrap: { backgroundColor: '#FAFAFA', borderRadius: 20, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },
  searchIcon: { marginLeft: 8 },
  filtersRow: { flexDirection: 'row' },
  // Ajustamos los estilos de los filtros para que entren 3
  filterInputWrap: { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 20, height: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  filterInput: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B', flex: 1, textAlignVertical: 'center' },
  listContent: { paddingRight: 16, paddingBottom: 20 },
  errorText: { color: 'red', textAlign: 'center', marginTop: 20, fontFamily: 'BarlowCondensed-Bold', position: 'absolute', bottom: 20, alignSelf: 'center' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999', fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  
  // Tarjetas
  cardContainer: { height: 140, borderRadius: 12, marginLeft: -7, overflow: 'hidden', position: 'relative', backgroundColor: 'transparent', marginBottom: 8 },
  cardContent: { flex: 1 },
  cardHeaderRow: { alignItems: 'flex-start' },
  flechaTagContainer: { height: 40, width: 220, justifyContent: 'center', paddingLeft: 20, position: 'relative' },
  tagText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 20, zIndex: 1, textTransform: 'uppercase' },
  cardBody: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 0, justifyContent: 'space-between' },
  infoColumn: { flex: 1, marginRight: 10 },
  infoRow: { marginBottom: 2 },
  label: { fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', fontSize: 14 },
  value: { fontFamily: 'BarlowCondensed-Regular', color: '#555', fontSize: 14 },
  statusColumn: { alignItems: 'flex-end', justifyContent: 'flex-start', width: 110, marginTop: -20 },
  badge: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center' },
  actionsRow: { flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end', width: '100%' },
  iconButton: { marginLeft: 15, padding: 8 },

  // Estilos del Modal de Filtros
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', maxHeight: '50%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 16 },
  modalTitle: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold', color: '#2B2B2B', paddingHorizontal: 16, paddingBottom: 12 },
  modalItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E7EAED', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalItemSelected: { backgroundColor: '#F0F9FF' },
  modalItemText: { fontSize: 16, fontFamily: 'BarlowCondensed-SemiBold', color: '#545454' },
  modalItemTextSelected: { color: '#1C9BD8' },
  modalClose: { alignSelf: 'center', marginVertical: 16, paddingHorizontal: 16, paddingVertical: 10 },
  modalCloseText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#1C9BD8' },

  // Modal "ver detalle" (bottom sheet en mobile)
  detailCardMobile: { backgroundColor: '#fff', maxHeight: '85%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20 },
});

// --- Estilos exclusivos de desktop ---
const ds = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  page: { width: '100%', paddingHorizontal: 40, paddingTop: 30 },
  pageTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 44, color: '#2B2B2B', marginBottom: 24, textTransform: 'uppercase' },

  filtersRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', height: 42, paddingHorizontal: 12, width: 240 },
  searchInput: { flex: 1, fontFamily: 'BarlowCondensed-Medium', fontSize: 14, color: '#2B2B2B' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAFAFA', borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', height: 42, paddingHorizontal: 14, width: 170 },
  filterText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#2B2B2B' },

  table: { borderWidth: 1, borderColor: '#ECECEC', borderRadius: 12, padding: 8 },
  tableHeadRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: '#F0F0F0' },
  th: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, color: '#8A8A8A', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F7F7F7' },
  rowCell: { fontFamily: 'Rubik', fontSize: 13, color: '#555' },
  badge: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { color: '#FFF', fontSize: 10, fontFamily: 'BarlowCondensed-Bold', textAlign: 'center' },
  emptyText: { textAlign: 'center', color: '#999', fontFamily: 'Rubik', fontSize: 15, marginTop: 60 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 16 },
  loadMoreText: { color: '#8A8A8A', fontFamily: 'Rubik', fontSize: 13 },

  modalBackdropD: { justifyContent: 'center', alignItems: 'center' },
  modalCardD: { width: 420, maxWidth: '90%', maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },

  // Modal "ver detalle" — funciona igual para mobile (bottom sheet, usa s.modalBackdrop
  // + s.detailCardMobile) y desktop (diálogo centrado más ancho, por la tabla de ítems).
  detailBackdropD: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  detailCardD: { backgroundColor: '#fff', width: 640, maxWidth: '92%', maxHeight: '85%', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  detailHeaderTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#2B2B2B', flex: 1, marginRight: 12 },
  detailErrorText: { textAlign: 'center', color: '#CC0000', marginVertical: 40, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 15, paddingHorizontal: 16 },
  detailScroll: { maxHeight: 520 },
  detailRow: { flexDirection: 'row', marginBottom: 6 },
  detailLabel: { width: 110, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#6B7280' },
  detailValue: { flex: 1, fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B' },
  detailDivider: { height: 1, backgroundColor: '#EEEEEE', marginVertical: 14 },
  itemsHeadRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  itemsHeadText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11, color: '#8A8A8A', letterSpacing: 0.5 },
  sectionTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#1C9BD8', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7F7F7' },
  itemName: { fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', paddingRight: 8 },
  itemCell: { fontFamily: 'Rubik', fontSize: 13, color: '#555' },
  taxRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  taxLabel: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },
  taxValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#2B2B2B' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  totalValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 24, color: '#1C9BD8' },
});

export default Pedidos;