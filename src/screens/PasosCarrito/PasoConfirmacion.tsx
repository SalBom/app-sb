import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  LayoutChangeEvent,
  Animated,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CarritoHeader from '../../components/CarritoHeader';
import { useCartStore } from '../../store/cartStore';
import LayoutRefresh from '../../components/LayoutRefresh';
import { getCuitFromStorage } from '../../utils/authStorage'; 
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import axios from 'axios';
import { API_URL } from '../../config'; 

import PantallaExitoPedido from './PantallaExitoPedido';

const SIDE_MARGIN = 10;
const TIPO_CAMBIO_FALLBACK = 1450;
const SHADOW_OFFSET = 6;  
const BLUR_RADIUS = 4;    
const SVG_PAD = 20;       

const ShapedCard = ({ children, style, onPress }: { children: React.ReactNode, style?: any, onPress?: () => void }) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };
  const w = layout.width;
  const h = layout.height;
  const k = 20; 
  const pathData = `M 0 0 L ${w - k} 0 L ${w} ${k} L ${w} ${h - k} L ${w - k} ${h} L 0 ${h} Z`;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.shapedCardContainer, style]} onLayout={onLayout} disabled={!onPress}>
      {w > 0 && h > 0 && (
        <View style={[StyleSheet.absoluteFill, { top: -SVG_PAD, left: -SVG_PAD, right: -SVG_PAD, bottom: -SVG_PAD, overflow: 'visible' }]}>
          <Svg width={w + SVG_PAD * 2} height={h + SVG_PAD * 2}>
            <Defs><Filter id="shadowBlur" x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur in="SourceGraphic" stdDeviation={BLUR_RADIUS} /></Filter></Defs>
            <G transform={`translate(${SVG_PAD}, ${SVG_PAD})`}>
                <Path d={pathData} fill="#000000" opacity={0.15} transform={`translate(${SHADOW_OFFSET}, ${SHADOW_OFFSET})`} filter="url(#shadowBlur)" />
                <Path d={pathData} fill="#FFFFFF" stroke="#F0F0F0" strokeWidth={1} />
            </G>
          </Svg>
        </View>
      )}
      <View style={{ paddingRight: k }}>{children}</View>
    </TouchableOpacity>
  );
};

const formatFecha = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};
const getClienteTexto = (c: any) => c == null ? '—' : typeof c === 'number' ? `ID ${c}` : typeof c === 'string' ? c : c?.name || c?.display_name || '—';
const getPlazoTexto = (p: any) => p == null ? '—' : typeof p === 'number' ? `ID ${p}` : typeof p === 'string' ? p : p?.nombre || p?.name || '—';
const getEnvioTexto = (m: any) => !m ? '—' : m === 'sucursal' ? 'Retiro por sucursal' : m === 'domicilio' ? 'Envío a domicilio' : String(m);
const formatPriceAR = (n: number) => `$${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0 }).format(Math.round(n))}`;
const formatUsd = (n: number) => `USD ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const toNumber = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

interface Props { onBack: () => void; }

const PasoConfirmacion: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  
  const { 
    items, 
    clienteSeleccionado, 
    plazoSeleccionado, 
    envioSeleccionado, 
    clearCart, 
    consultaResumen, 
    direccionEntrega,
    transporte,
    notas: notasIniciales
  } = useCartStore() as any;

  const [userRole, setUserRole] = useState<string>('');
  const [loggedUserName, setLoggedUserName] = useState<string>(''); 
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editValues, setEditValues] = useState({ price: '', d1: '', d2: '', d3: '' });
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [finalOrderName, setFinalOrderName] = useState('');
  
  const [finalTotal, setFinalTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false); 
  const [observationText, setObservationText] = useState(notasIniciales || '');
  const [showObservationModal, setShowObservationModal] = useState(false);

  const [liveTotals, setLiveTotals] = useState({ base: 0, tax: 0, total: 0 });
  const [isSyncingTotals, setIsSyncingTotals] = useState(false);

  const draftOrderId = consultaResumen?.pedido_id;
  const rawNroPedido = consultaResumen?.nro_pedido || consultaResumen?.name || '---';
  const isBorrador = ['/', 'New', 'Nuevo', '* Nuevo *', 'Borrador'].includes(rawNroPedido);
  const nroPedidoFormateado = isBorrador ? (draftOrderId ? `Pedido #${draftOrderId}` : 'Pendiente asignar') : rawNroPedido;

  const confirmAnim = useRef(new Animated.Value(0)).current; 
  const backAnim = useRef(new Animated.Value(0)).current; 

  const animateBtn = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, { toValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handleBackPress = () => {
    animateBtn(backAnim, 0);
    if (!loading) onBack();
  };

  const handleConfirmPress = () => {
    animateBtn(confirmAnim, 0);
    confirmarPedido();
  };

  useEffect(() => {
    const checkRole = async () => {
        const cuit = await getCuitFromStorage();
        if (cuit) {
            try {
                const res = await axios.get(`${API_URL}/usuario-perfil`, { params: { cuit } });
                const data = res.data;
                if (data?.role) setUserRole(data.role);
                if (data?.name) setLoggedUserName(data.name);
            } catch (e) { }
        }
    };
    checkRole();
    cargarDatos();
  }, []);

  const cargarDatos = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/tipo-cambio`);
      const tc = Number(r.data?.inverse_rate || r.data?.rate || 0);
      setTipoCambio(tc > 0 ? tc : TIPO_CAMBIO_FALLBACK);
    } catch { setTipoCambio(TIPO_CAMBIO_FALLBACK); }
  }, []);

  const canEdit = userRole === 'Admin' || userRole === 'Vendedor Black';

  const openEditModal = (item: any) => {
      setEditingItem(item);
      setEditValues({
          price: String(item.price_unit || 0),
          d1: String(item.discount1 || 0),
          d2: String(item.discount2 || 0),
          d3: String(item.discount3 || 0),
      });
      setModalVisible(true);
  };

  const handleSaveEdit = () => {
      if (!editingItem) return;
      const newPrice = parseFloat(editValues.price) || 0;
      const nd1 = parseFloat(editValues.d1) || 0;
      const nd2 = parseFloat(editValues.d2) || 0;
      const nd3 = parseFloat(editValues.d3) || 0;

      const currentItems = useCartStore.getState().items;
      const newItems = currentItems.map((it: any) => {
          if (it.product_id === editingItem.product_id) {
              return { ...it, price_unit: newPrice, discount1: nd1, discount2: nd2, discount3: nd3 };
          }
          return it;
      });
      useCartStore.setState({ items: newItems });
      setModalVisible(false);
      setEditingItem(null);
  };

  // =====================================================================
  // REGLA MATEMÁTICA Y NOMBRES DEL TRANSPORTE
  // =====================================================================
  const tcSeguro = tipoCambio && tipoCambio > 0 ? tipoCambio : TIPO_CAMBIO_FALLBACK;
  const transporteNombre = transporte?.name || transporte?.transporte || 'Desconocido';
  const esEnvioADomicilio = envioSeleccionado === 'domicilio' || transporteNombre.toLowerCase().includes('domicilio');

  // 1. Calculamos la Base Imponible pura de los productos
  const localBaseSinTransporte = Array.isArray(items) 
    ? items.filter((it: any) => String(it.product_id) !== '4011').reduce((acc: number, it: any) => {
        const qty = toNumber(it?.product_uom_qty ?? it?.qty ?? it?.quantity ?? 1);
        const price = toNumber(it?.price_unit);
        const d1 = toNumber(it?.discount1); const d2 = toNumber(it?.discount2); const d3 = toNumber(it?.discount3);
        const factor = (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
        return acc + (price * qty * factor);
    }, 0) 
    : 0;

  // 2. Aplicamos la tabla de costos de flete (En Pesos convertidos a USD)
  const baseARS = localBaseSinTransporte * tcSeguro;
  let costoEnvioUSD = 0;

  if (esEnvioADomicilio) {
      if (baseARS < 250000) {
          costoEnvioUSD = 9000 / tcSeguro;
      } else if (baseARS < 500000) {
          costoEnvioUSD = 6000 / tcSeguro;
      } else {
          costoEnvioUSD = 0; // Flete Gratis
      }
  }

  // 3. Nombre exacto para la descripción en Odoo
  const nombreEnvioCompleto = esEnvioADomicilio 
        ? `Envío a Domicilio - ${transporteNombre}` 
        : `Transporte - ${transporteNombre}`;

  // 4. Inyectamos la línea 4011 para que el backend la procese como un producto normal
  let hasTransportItem = false;
  const itemsProcesados = Array.isArray(items) ? items.map((it: any) => {
      if (String(it.product_id) === '4011') {
          hasTransportItem = true;
          return { ...it, price_unit: costoEnvioUSD, name: nombreEnvioCompleto, discount1: 0, discount2: 0, discount3: 0 };
      }
      return it;
  }) : [];

  if (esEnvioADomicilio && !hasTransportItem && items.length > 0) {
      itemsProcesados.push({
          product_id: 4011,
          name: nombreEnvioCompleto,
          default_code: 'FLETE',
          qty: 1,
          product_uom_qty: 1,
          price_unit: costoEnvioUSD,
          discount1: 0, discount2: 0, discount3: 0,
          payment_term_id: plazoSeleccionado?.id 
      });
  }
  // =====================================================================

  useEffect(() => {
    const fetchExactTotals = async () => {
        if (!draftOrderId || itemsProcesados.length === 0) return;
        setIsSyncingTotals(true);
        try {
            const cuitUser = await getCuitFromStorage();
            const payload = {
                order_id_to_update: draftOrderId,
                cliente_cuit: clienteSeleccionado?.vat || cuitUser,
                payment_term_id: plazoSeleccionado?.id,
                partner_shipping_id: direccionEntrega?.id || null,
                carrier_id: transporte?.id || null,
                
                // Enviamos los items ya procesados (Con la línea 4011 inyectada y valuada)
                items: itemsProcesados.map((it: any) => ({
                    product_id: it.product_id,
                    qty: it.product_uom_qty || it.qty || it.quantity || 1,
                    product_uom_qty: it.product_uom_qty || it.qty || it.quantity || 1,
                    price_unit: it.price_unit,
                    payment_term_id: it.payment_term_id,
                    name: it.name,
                    discount1: it.discount1 || 0,
                    discount2: it.discount2 || 0,
                    discount3: it.discount3 || 0
                }))
            };
            const resp = await axios.post(`${API_URL}/actualizar-pedido`, payload);
            if (resp.data && resp.data.total) {
                setLiveTotals({
                    base: toNumber(resp.data.base_imponible),
                    tax: toNumber(resp.data.impuestos),
                    total: toNumber(resp.data.total)
                });
            }
        } catch (error) {
            console.log("Error sincronizando totales:", error);
        } finally {
            setIsSyncingTotals(false);
        }
    };

    fetchExactTotals();
  }, [items, draftOrderId, costoEnvioUSD]); 

  // Matemática provisoria
  const localBase = localBaseSinTransporte + costoEnvioUSD;
  const localTax = localBase * 0.21;
  const localTotal = localBase + localTax;

  const mostrarBase  = liveTotals.total > 0 ? liveTotals.base : localBase;
  const mostrarImpuestos = liveTotals.total > 0 ? liveTotals.tax : localTax;
  const mostrarTotal = liveTotals.total > 0 ? liveTotals.total : localTotal;

  const confirmarPedido = async () => {
    if (loading || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setLoading(true);
    
    try {
      const cuitUser = await getCuitFromStorage();
      
      const itemsValidos = itemsProcesados.filter((it: any) => {
        const pid = Number(it.product_id);
        return !isNaN(pid) && pid < 2147483647;
      });

      if (itemsValidos.length === 0) {
        Alert.alert("Error", "No hay productos válidos en el carrito.");
        isSubmittingRef.current = false;
        setLoading(false);
        return;
      }
      
      const v_name = loggedUserName || 'Vendedor App';

      const payload = {
          order_id_to_update: draftOrderId || null, 
          cliente_cuit: clienteSeleccionado?.vat || cuitUser, 
          payment_term_id: plazoSeleccionado?.id,
          partner_shipping_id: direccionEntrega?.id || null, 
          created_by_name: v_name, 
          carrier_id: transporte?.id || null, 
          
          items: itemsValidos.map((it: any) => ({
              product_id: it.product_id,
              qty: it.product_uom_qty || it.qty || it.quantity || 1, 
              product_uom_qty: it.product_uom_qty || it.qty || it.quantity || 1,
              price_unit: it.price_unit,
              payment_term_id: it.payment_term_id, 
              name: it.name, 
              discount1: it.discount1 || 0,
              discount2: it.discount2 || 0,
              discount3: it.discount3 || 0
          })),
          
          note: observationText, 
          observaciones: observationText 
                ? `Cargado por: ${v_name}\n\nObservaciones del cliente: ${observationText}` 
                : `Cargado por: ${v_name}`
      };

      const resp = await axios.post(`${API_URL}/crear-pedido`, payload);
      const j = resp.data;
      
      if (j && j.pedido_id) {
        let finalNro = j.nro_pedido || j.name || '---';
        if (['/', 'New', 'Nuevo', '* Nuevo *', 'Borrador'].includes(finalNro)) {
            finalNro = `Pedido #${j.pedido_id}`;
        }
        setFinalOrderName(finalNro);
        setFinalTotal(j.total || mostrarTotal);
        setShowSuccess(true);
        clearCart(); 
      } else {
        Alert.alert('Error', j?.error ? String(j.error) : 'Error al confirmar.');
        isSubmittingRef.current = false;
      }
    } catch (e: any) {
        if (e.response?.status === 409) {
           Alert.alert("Revisar carrito", e.response.data.error || "Uno de los productos ya no está disponible.");
        } else {
           const err = e.response?.data?.error || e.message || 'Error de conexión';
           Alert.alert('Estado del Pedido', `Pudo haber un problema de conexión al recibir respuesta. Verifique "Mis Pedidos".\n\nDetalle: ${err}`); 
        }
        isSubmittingRef.current = false;
    } finally {
        setLoading(false);
    }
  };

  const getScale = (anim: Animated.Value) => anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const getTranslate = (anim: Animated.Value) => anim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });

  if (showSuccess) {
      return <PantallaExitoPedido nroPedido={finalOrderName} montoTotal={finalTotal} onVolver={() => onBack()} />;
  }

  if (!clienteSeleccionado) {
     return (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
           <ActivityIndicator size="large" color="#1C9BD8" />
           <Text style={{ marginTop: 20, color: '#666', fontWeight: '600' }}>Cargando resumen...</Text>
           <TouchableOpacity style={[styles.back, { marginTop: 30, width: 200, flex: 0 }]} onPress={onBack}>
             <Text style={styles.backText}>VOLVER</Text>
           </TouchableOpacity>
        </View>
     );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <LayoutRefresh onRecargar={cargarDatos} contentContainerStyle={{ paddingBottom: 5 + insets.bottom }}>
        <CarritoHeader step={3} onBack={onBack} />
        
        <ShapedCard style={{ marginHorizontal: SIDE_MARGIN, marginTop: 6, marginBottom: 24 }}>
            <Text style={styles.titleDetalle}>DETALLES DE PEDIDO</Text>
            <View style={styles.row}><Text style={styles.label}>Cliente:</Text><Text style={styles.value}>{getClienteTexto(clienteSeleccionado)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Pago:</Text><Text style={styles.value}>{getPlazoTexto(plazoSeleccionado)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Envío:</Text><Text style={styles.value}>{direccionEntrega ? `${direccionEntrega.street || ''}, ${direccionEntrega.city || ''}` : getEnvioTexto(envioSeleccionado)}</Text></View>
            {transporte && (
                <View style={styles.row}><Text style={styles.label}>Transporte:</Text><Text style={styles.value}>{transporte.name || transporte.transporte}</Text></View>
            )}
            <View style={[styles.row, { marginBottom: 0 }]}><Text style={styles.label}>Fecha:</Text><Text style={styles.value}>{formatFecha()}</Text></View>
        </ShapedCard>

        {itemsProcesados.length > 0 && (
          <View style={styles.prodWrap}>
            <View style={styles.tableHeader}>
                <Text style={[styles.headerText, { flex: 1.1, textAlign: 'left' }]}>REF.</Text>
                <Text style={[styles.headerText, { flex: 0.5, textAlign: 'center' }]}>CANT</Text>
                <Text style={[styles.headerText, { flex: 0.9, textAlign: 'right' }]}>PRECIO</Text>
                <Text style={[styles.headerText, { flex: 0.6, textAlign: 'center' }]}>DTO</Text>
                <Text style={[styles.headerText, { flex: 1, textAlign: 'right' }]}>SUBTOTAL</Text>
            </View>
            <View style={styles.headerLine} />
            {itemsProcesados.map((it: any, index: number) => {
              const isTransport = String(it.product_id) === '4011';
              const referral = it.default_code || it.name || 'SIN REF';
              const qty = toNumber(it?.product_uom_qty ?? it?.qty ?? it?.quantity ?? 1);
              const priceUnit = toNumber(it?.price_unit);
              const d1 = toNumber(it?.discount1); const d2 = toNumber(it?.discount2); const d3 = toNumber(it?.discount3);
              const factor = (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
              
              const subTotalLine = priceUnit * qty * factor;
              
              return (
                <View key={it.product_id ?? index} style={styles.prodRow}>
                  <View style={styles.colRef}><Text allowFontScaling={false} style={styles.codeText} numberOfLines={2}>{referral}</Text></View>
                  <View style={styles.vSep} />
                  <View style={styles.colQty}><Text allowFontScaling={false} style={styles.qtyText}>x{qty}</Text></View>
                  <View style={styles.vSep} />
                  <TouchableOpacity style={styles.colPrice} disabled={!canEdit || isTransport} onPress={() => openEditModal(it)}>
                    <Text allowFontScaling={false} style={[styles.priceText, canEdit && !isTransport && { color: '#1C9BD8', textDecorationLine: 'underline' }]} numberOfLines={1}>{formatUsd(priceUnit)}</Text>
                  </TouchableOpacity>
                  <View style={styles.vSep} />
                  <TouchableOpacity style={styles.colDisc} disabled={!canEdit || isTransport} onPress={() => openEditModal(it)}>
                    {isTransport ? <Text style={styles.dash}>-</Text> : ((d1 > 0 || d2 > 0 || d3 > 0) ? (<View style={[styles.discountBadge, canEdit && { backgroundColor: '#E3F2FD' }]}><Text allowFontScaling={false} style={styles.discountText}>{[d1, d2, d3].filter(d => d > 0).join('+')}%</Text></View>) : (<Text style={[styles.dash, canEdit && { color: '#1C9BD8' }]}>{canEdit ? 'Add' : '-'}</Text>))}
                  </TouchableOpacity>
                  <View style={styles.vSep} />
                  <View style={styles.colSub}><Text allowFontScaling={false} style={styles.subText} numberOfLines={1}>{formatUsd(subTotalLine)}</Text></View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.taxWrap}>
          <View style={styles.taxRow}>
            <View style={styles.taxLeft}><Text style={styles.taxLeftText}>Base imponible</Text><Text style={styles.taxLeftText}>Impuestos</Text></View>
            <View style={styles.taxSeparator} />
            <View style={styles.taxRight}>
                {isSyncingTotals ? (
                    <>
                        <Text style={[styles.taxRightText, { color: '#AAA' }]}>Calculando...</Text>
                        <Text style={[styles.taxRightText, { color: '#AAA' }]}>Calculando...</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.taxRightText}>{formatUsd(mostrarBase)}</Text>
                        <Text style={styles.taxRightText}>{formatUsd(mostrarImpuestos)}</Text>
                    </>
                )}
            </View>
          </View>
          <View style={styles.taxDivider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}> 
              <View><Text style={styles.fxLabel}>Nro. Pedido</Text><Text style={styles.fxValue}>{nroPedidoFormateado}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.fxLabel}>Tipo de cambio</Text><Text style={styles.fxValue}>{tipoCambio ? formatPriceAR(tipoCambio) : '—'}</Text></View>
          </View>
          <View style={{ alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                {isSyncingTotals ? (
                    <ActivityIndicator size="small" color="#1C9BD8" style={{ marginLeft: 10 }} />
                ) : (
                    <Text style={styles.totalValue}>{formatUsd(mostrarTotal)}</Text>
                )}
              </View>
          </View>
        </View>

        <View style={{ marginTop: 24, marginBottom: 16 }}>
            <TouchableOpacity style={styles.obsLink} onPress={() => setShowObservationModal(true)}>
                <Text style={styles.obsLinkText}>
                    {observationText ? 'Editar Observaciones al Cliente' : '+ Agregar Instrucciones al Cliente'}
                </Text>
            </TouchableOpacity>
        </View>

      </LayoutRefresh>

      <View style={[styles.footerContainer, { paddingBottom: Math.max(20, insets.bottom + 35) }]}>
        <View style={styles.buttons}>
          <TouchableWithoutFeedback onPressIn={() => animateBtn(backAnim, 1)} onPressOut={() => animateBtn(backAnim, 0)} onPress={handleBackPress}>
              <Animated.View style={[styles.back, { transform: [{ scale: getScale(backAnim) }, { translateY: getTranslate(backAnim) }] }]}>
                  <Text style={styles.backText}>VOLVER</Text>
              </Animated.View>
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback disabled={loading} onPressIn={() => animateBtn(confirmAnim, 1)} onPressOut={() => animateBtn(confirmAnim, 0)} onPress={handleConfirmPress}>
              <Animated.View style={[styles.confirm, loading && { backgroundColor: '#A0A0A0' }, { transform: [{ scale: getScale(confirmAnim) }, { translateY: getTranslate(confirmAnim) }] }]}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>CONFIRMAR PEDIDO</Text>}
              </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </View>

      {/* Modal de Precios */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Editar Producto</Text>
                <Text style={styles.modalSubtitle}>{editingItem?.name || 'Producto'}</Text>
                <View style={styles.inputGroup}><Text style={styles.inputLabel}>Precio Unitario (USD)</Text><TextInput style={styles.input} keyboardType="numeric" value={editValues.price} onChangeText={(t) => setEditValues(prev => ({...prev, price: t}))}/></View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.inputGroup, { flex: 1 }]}><Text style={styles.inputLabel}>Desc 1 (%)</Text><TextInput style={styles.input} keyboardType="numeric" value={editValues.d1} onChangeText={(t) => setEditValues(prev => ({...prev, d1: t}))} /></View>
                    <View style={[styles.inputGroup, { flex: 1 }]}><Text style={styles.inputLabel}>Desc 2 (%)</Text><TextInput style={styles.input} keyboardType="numeric" value={editValues.d2} onChangeText={(t) => setEditValues(prev => ({...prev, d2: t}))} /></View>
                    <View style={[styles.inputGroup, { flex: 1 }]}><Text style={styles.inputLabel}>Desc 3 (%)</Text><TextInput style={styles.input} keyboardType="numeric" value={editValues.d3} onChangeText={(t) => setEditValues(prev => ({...prev, d3: t}))} /></View>
                </View>
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}><Text style={styles.modalBtnTextCancel}>Cancelar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveEdit}><Text style={styles.modalBtnTextSave}>Guardar</Text></TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de Notas */}
      <Modal visible={showObservationModal} transparent animationType="slide">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Instrucciones del Pedido</Text>
                    <Text style={styles.modalSubtitle}>Esta nota se imprimirá en el PDF para el cliente.</Text>
                    
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Mensaje:</Text>
                        <TextInput 
                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
                            multiline 
                            placeholder="Ej: Entregar por la mañana..."
                            value={observationText}
                            onChangeText={setObservationText}
                        />
                    </View>

                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setShowObservationModal(false)} style={[styles.modalBtnCancel, { backgroundColor: '#CCC' }]}>
                            <Text style={styles.modalBtnTextCancel}>CERRAR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowObservationModal(false)} style={[styles.modalBtnSave, { backgroundColor: '#1C9BD8' }]}>
                            <Text style={styles.modalBtnTextSave}>GUARDAR</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  shapedCardContainer: { marginLeft: 14, marginRight: 14, paddingVertical: 12, paddingLeft: 20, backgroundColor: 'transparent', marginBottom: 0 },
  titleDetalle: { fontSize: 18, fontWeight: '800', color: '#2B2B2B', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  label: { width: 150, fontWeight: '800', color: '#2B2B2B' },
  value: { flex: 1, color: '#2B2B2B', lineHeight: 18 },
  
  prodWrap: { marginTop: 8, paddingBottom: 6 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 4, marginTop: 10 },
  headerText: { fontSize: 10, fontWeight: '800', color: '#909090', letterSpacing: 0.5 },
  headerLine: { height: 1, backgroundColor: '#E5E6EA', marginBottom: 8 },
  prodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  vSep: { width: 1, height: '80%', backgroundColor: '#E5E6EA', marginHorizontal: 4 },
  colRef: { flex: 1.1, justifyContent: 'center', paddingRight: 2 },
  codeText: { color: '#2B2B2B', fontWeight: '700', fontSize: 11 }, 
  colQty: { flex: 0.5, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#666', fontSize: 11, fontWeight: '600' },
  colPrice: { flex: 0.9, alignItems: 'flex-end', justifyContent: 'center' },
  priceText: { fontWeight: '600', color: '#2B2B2B', fontSize: 11 },
  colDisc: { flex: 0.6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  discountBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3, minWidth: 28, alignItems: 'center' },
  discountText: { fontSize: 9, fontWeight: '800', color: '#1C9BD8' },
  dash: { color: '#CCC', fontSize: 12, textAlign: 'center' },
  colSub: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  subText: { fontWeight: '800', color: '#2B2B2B', fontSize: 12 },
  
  taxWrap: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginTop: 8, marginHorizontal: 14 },
  taxRow: { flexDirection: 'row', alignItems: 'stretch' },
  taxLeft: { flex: 1.4, gap: 8 }, 
  taxRight: { flex: 1, alignItems: 'flex-end', gap: 8 },
  taxLeftText: { color: '#2B2B2B', fontSize: 13 }, 
  taxRightText: { color: '#2B2B2B', fontWeight: '800', fontSize: 14 },
  taxSeparator: { width: 2, backgroundColor: '#E5E6EA', marginHorizontal: 12, borderRadius: 2 },
  taxDivider: { height: 1, backgroundColor: '#E5E6EA', marginTop: 12, marginBottom: 12 },
  fxLabel: { color: '#6A6E73', fontSize: 11, marginBottom: 2, fontWeight: '600' },
  fxValue: { color: '#2B2B2B', fontWeight: '800', fontSize: 13 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#2B2B2B' },
  totalValue: { fontSize: 24, fontWeight: '900', color: '#1C9BD8' },

  footerContainer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15, paddingHorizontal: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 5 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 8 },
  back: { flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  backText: { color: '#2B2B2B', fontWeight: '800' },
  confirm: { flex: 1, height: 46, borderRadius: 999, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#fff', fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#2B2B2B', marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  inputGroup: { marginBottom: 15 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 16, color: '#333', backgroundColor: '#F9F9F9' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalBtnCancel: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#EEE' },
  modalBtnTextCancel: { fontWeight: '700', color: '#666' },
  modalBtnSave: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#1C9BD8' },
  modalBtnTextSave: { fontWeight: '700', color: '#FFF' },
  
  obsLink: { alignSelf: 'center' }, 
  obsLinkText: { color: '#1C9BD8', fontFamily: 'Rubik-Medium', textDecorationLine: 'underline', fontWeight: '800' },
});

export default PasoConfirmacion;