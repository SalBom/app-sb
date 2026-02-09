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
  ScrollView
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
  const { items, clienteSeleccionado, plazoSeleccionado, envioSeleccionado, clearCart, consultaResumen, direccionEntrega } = useCartStore() as any;

  const [userRole, setUserRole] = useState<string>('');
  const [loggedUserName, setLoggedUserName] = useState<string>(''); // Nuevo: Nombre del usuario
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editValues, setEditValues] = useState({ price: '', d1: '', d2: '', d3: '' });
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [finalOrderName, setFinalOrderName] = useState('');
  
  const [finalTotal, setFinalTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [observationText, setObservationText] = useState('');
  const [showObservationModal, setShowObservationModal] = useState(false);

  const nroPedido = consultaResumen?.nro_pedido || consultaResumen?.name || '---';
  const confirmAnim = useRef(new Animated.Value(0)).current; 
  const backAnim = useRef(new Animated.Value(0)).current; 

  const animateBtn = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, { toValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handleBackPress = () => {
    animateBtn(backAnim, 0);
    onBack();
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
                // Guardamos el nombre para enviarlo después
                if (data?.name) setLoggedUserName(data.name);
            } catch (e) { }
        }
    };
    checkRole();
    cargarDatos();
  }, []);

  const cargarDatos = useCallback(async () => {
    try {
      // Obtenemos TC real desde Backend
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

  const totalUSD_local = Array.isArray(items)
    ? items.reduce((acc: number, it: any) => {
        const qty = toNumber(it?.product_uom_qty ?? it?.qty ?? 1);
        const price = toNumber(it?.price_unit);
        const d1 = toNumber(it?.discount1); const d2 = toNumber(it?.discount2); const d3 = toNumber(it?.discount3);
        const isTransport = String(it.product_id) === '4011';
        const factor = (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
        return acc + (isTransport ? (price * qty) : (price * qty * factor));
      }, 0)
    : 0;

  const baseBackend = consultaResumen?.base_imponible ? toNumber(consultaResumen.base_imponible) : 0;
  const totalBackend = consultaResumen?.total ? toNumber(consultaResumen.total) : 0;
  const hasBackendData = totalBackend > 0;

  const mostrarBase  = hasBackendData ? baseBackend : totalUSD_local;
  const mostrarTotal = hasBackendData ? totalBackend : (totalUSD_local * 1.21);
  const mostrarImpuestos = mostrarTotal - mostrarBase;

  const confirmarPedido = async () => {
    setLoading(true);
    try {
      const cuitUser = await getCuitFromStorage();
      
      const payload = {
          cliente_cuit: clienteSeleccionado?.vat || cuitUser, 
          payment_term_id: plazoSeleccionado?.id,
          partner_shipping_id: direccionEntrega?.id || null, 
          
          // Enviamos quién creó el pedido
          created_by_name: loggedUserName, 

          items: items.map((it: any) => ({
              product_id: it.product_id,
              product_uom_qty: it.product_uom_qty,
              price_unit: it.price_unit,
              // IMPORTANTE: Enviamos el plazo individual para la agrupación en backend
              payment_term_id: it.payment_term_id, 
              name: it.name, 
              discount1: it.discount1 || 0,
              discount2: it.discount2 || 0,
              discount3: it.discount3 || 0
          })),
          
          carrier_id: null, 
          observaciones: observationText 
      };

      const resp = await axios.post(`${API_URL}/crear-pedido`, payload);
      const j = resp.data;
      
      if (j && j.pedido_id) {
        setFinalOrderName(j.nro_pedido || j.name || '---');
        setFinalTotal(j.total || mostrarTotal);
        setShowSuccess(true);
        clearCart(); 
      } else {
        Alert.alert('Error', j?.error ? String(j.error) : 'Error al confirmar.');
      }
    } catch (e: any) {
        const err = e.response?.data?.error || e.message || 'Error de conexión';
        Alert.alert('Error', String(err)); 
    } finally {
        setLoading(false);
    }
  };

  const getScale = (anim: Animated.Value) => anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const getTranslate = (anim: Animated.Value) => anim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });

  if (showSuccess) {
      return <PantallaExitoPedido nroPedido={finalOrderName} montoTotal={finalTotal} onVolver={() => onBack()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <LayoutRefresh onRecargar={cargarDatos} contentContainerStyle={{ paddingBottom: 5 + insets.bottom }}>
        <CarritoHeader step={3} onBack={onBack} />
        
        <ShapedCard style={{ marginHorizontal: SIDE_MARGIN, marginTop: 6, marginBottom: 24 }}>
            <Text style={styles.titleDetalle}>DETALLES DE PEDIDO</Text>
            <View style={styles.row}><Text style={styles.label}>Cliente:</Text><Text style={styles.value}>{getClienteTexto(clienteSeleccionado)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Pago:</Text><Text style={styles.value}>{getPlazoTexto(plazoSeleccionado)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Envío:</Text><Text style={styles.value}>{getEnvioTexto(envioSeleccionado)}</Text></View>
            <View style={[styles.row, { marginBottom: 0 }]}><Text style={styles.label}>Fecha:</Text><Text style={styles.value}>{formatFecha()}</Text></View>
        </ShapedCard>

        {Array.isArray(items) && items.length > 0 && (
          <View style={styles.prodWrap}>
            <View style={styles.tableHeader}>
                <Text style={[styles.headerText, { flex: 1.1, textAlign: 'left' }]}>REF.</Text>
                <Text style={[styles.headerText, { flex: 0.5, textAlign: 'center' }]}>CANT</Text>
                <Text style={[styles.headerText, { flex: 0.9, textAlign: 'right' }]}>PRECIO</Text>
                <Text style={[styles.headerText, { flex: 0.6, textAlign: 'center' }]}>DTO</Text>
                <Text style={[styles.headerText, { flex: 1, textAlign: 'right' }]}>SUBTOTAL</Text>
            </View>
            <View style={styles.headerLine} />
            {items.map((it: any) => {
              const isTransport = String(it.product_id) === '4011';
              const referral = it.default_code || it.name || 'SIN REF';
              const qty = toNumber(it?.product_uom_qty ?? it?.qty ?? 1);
              const priceUnit = toNumber(it?.price_unit);
              const d1 = toNumber(it?.discount1); const d2 = toNumber(it?.discount2); const d3 = toNumber(it?.discount3);
              const factor = (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
              const subTotalLine = isTransport ? (priceUnit * qty) : (priceUnit * qty * factor);
              
              return (
                <View key={it.product_id ?? Math.random()} style={styles.prodRow}>
                  <View style={styles.colRef}><Text allowFontScaling={false} style={styles.codeText}>{referral}</Text></View>
                  <View style={styles.vSep} />
                  <View style={styles.colQty}><Text allowFontScaling={false} style={styles.qtyText}>x{qty}</Text></View>
                  <View style={styles.vSep} />
                  <TouchableOpacity style={styles.colPrice} disabled={!canEdit} onPress={() => openEditModal(it)}>
                    <Text allowFontScaling={false} style={[styles.priceText, canEdit && { color: '#1C9BD8', textDecorationLine: 'underline' }]} numberOfLines={1}>{formatUsd(priceUnit)}</Text>
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
            <View style={styles.taxSeparator} /><View style={styles.taxRight}><Text style={styles.taxRightText}>{formatUsd(mostrarBase)}</Text><Text style={styles.taxRightText}>{formatUsd(mostrarImpuestos)}</Text></View>
          </View>
          <View style={styles.taxDivider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}> 
              <View><Text style={styles.fxLabel}>Nro. Pedido</Text><Text style={styles.fxValue}>{nroPedido}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.fxLabel}>Tipo de cambio</Text><Text style={styles.fxValue}>{tipoCambio ? formatPriceAR(tipoCambio) : '—'}</Text></View>
          </View>
          <View style={{ alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>{formatUsd(mostrarTotal)}</Text>
              </View>
          </View>
        </View>

        {/* --- BOTÓN DE OBSERVACIONES (Movido abajo) --- */}
        <View style={{ marginTop: 24, marginBottom: 16 }}>
            <TouchableOpacity style={styles.obsLink} onPress={() => setShowObservationModal(true)}>
                <Text style={styles.obsLinkText}>
                    {observationText ? 'Editar Observaciones' : '+ Agregar Observaciones'}
                </Text>
            </TouchableOpacity>
        </View>

      </LayoutRefresh>

      <View style={[styles.footerContainer, { paddingBottom: Math.max(20, insets.bottom + 35) }]}>
        <View style={styles.buttons}>
          <TouchableWithoutFeedback onPressIn={() => animateBtn(backAnim, 1)} onPressOut={() => animateBtn(backAnim, 0)} onPress={handleBackPress}><Animated.View style={[styles.back, { transform: [{ scale: getScale(backAnim) }, { translateY: getTranslate(backAnim) }] }]}><Text style={styles.backText}>VOLVER</Text></Animated.View></TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPressIn={() => animateBtn(confirmAnim, 1)} onPressOut={() => animateBtn(confirmAnim, 0)} onPress={handleConfirmPress}><Animated.View style={[styles.confirm, { transform: [{ scale: getScale(confirmAnim) }, { translateY: getTranslate(confirmAnim) }] }]}><Text style={styles.confirmText}>{loading ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}</Text></Animated.View></TouchableWithoutFeedback>
        </View>
      </View>

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

      <Modal visible={showObservationModal} transparent animationType="slide">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Observaciones</Text>
                    <Text style={styles.modalSubtitle}>Agrega notas para el vendedor o transporte</Text>
                    
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
  prodWrap: { marginTop: 16, marginHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 4 },
  headerText: { fontSize: 9, fontWeight: '800', color: '#909090', letterSpacing: 0.5 },
  headerLine: { height: 1, backgroundColor: '#E5E6EA', marginBottom: 8 },
  prodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  vSep: { width: 1, height: '80%', backgroundColor: '#E5E6EA', marginHorizontal: 4 },
  colRef: { flex: 1.1, justifyContent: 'center', paddingRight: 2 },
  codeText: { color: '#2B2B2B', fontWeight: '700', fontSize: 10 }, 
  colQty: { flex: 0.5, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#666', fontSize: 10, fontWeight: '600' },
  colPrice: { flex: 0.9, alignItems: 'flex-end', justifyContent: 'center' },
  priceText: { fontWeight: '600', color: '#2B2B2B', fontSize: 10 },
  colDisc: { flex: 0.6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  discountBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3, minWidth: 28, alignItems: 'center' },
  discountText: { fontSize: 8, fontWeight: '800', color: '#1C9BD8' },
  dash: { color: '#CCC', fontSize: 12, textAlign: 'center' },
  colSub: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  subText: { fontWeight: '800', color: '#2B2B2B', fontSize: 11 },
  taxWrap: { marginTop: 16, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#ECEDEF', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  taxRow: { flexDirection: 'row', alignItems: 'stretch' },
  taxLeft: { flex: 1.4, gap: 8 }, taxRight: { flex: 1, alignItems: 'flex-end', gap: 8 },
  taxLeftText: { color: '#2B2B2B' }, taxRightText: { color: '#2B2B2B', fontWeight: '800' },
  taxSeparator: { width: 2, backgroundColor: '#E5E6EA', marginHorizontal: 12, borderRadius: 2 },
  taxDivider: { height: 1, backgroundColor: '#E5E6EA', marginTop: 12, marginBottom: 10 },
  fxLabel: { color: '#6A6E73', fontSize: 12, marginBottom: 2 },
  fxValue: { color: '#2B2B2B', fontWeight: '800' },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#2B2B2B' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#2B2B2B' },
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
  obsLinkText: { color: '#1C9BD8', fontFamily: 'Rubik-Medium', textDecorationLine: 'underline' },
});

export default PasoConfirmacion;