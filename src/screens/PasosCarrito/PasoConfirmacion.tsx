import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  LayoutChangeEvent,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CarritoHeader from '../../components/CarritoHeader';
import { useCartStore, ProductoCarrito } from '../../store/cartStore'; 
import LayoutRefresh from '../../components/LayoutRefresh';
import Svg, { Path, Defs, Filter, FeGaussianBlur, FeOffset, FeMerge, FeMergeNode } from 'react-native-svg';
import axios from 'axios';
import { API_URL } from '../../config'; 

import PantallaExitoPedido from './PantallaExitoPedido';

const SIDE_MARGIN = 10;
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

  let dPath = "";
  if (w > 0 && h > 0) {
    const sw = w + SVG_PAD * 2;
    const sh = h + SVG_PAD * 2;
    const r = 12;
    const cutW = 25; 
    const cutH = 20; 

    dPath = `
      M ${SVG_PAD + r} ${SVG_PAD}
      H ${sw - SVG_PAD - cutW}
      L ${sw - SVG_PAD} ${SVG_PAD + cutH}
      V ${sh - SVG_PAD - r}
      Q ${sw - SVG_PAD} ${sh - SVG_PAD} ${sw - SVG_PAD - r} ${sh - SVG_PAD}
      H ${SVG_PAD + r}
      Q ${SVG_PAD} ${sh - SVG_PAD} ${SVG_PAD} ${sh - SVG_PAD - r}
      V ${SVG_PAD + r}
      Q ${SVG_PAD} ${SVG_PAD} ${SVG_PAD + r} ${SVG_PAD}
      Z
    `;
  }

  return (
    <View style={[{ position: 'relative' }, style]}>
      {w > 0 && h > 0 && (
        <Svg
          width={w + SVG_PAD * 2}
          height={h + SVG_PAD * 2}
          style={{ position: 'absolute', top: -SVG_PAD, left: -SVG_PAD }}
        >
          <Defs>
            <Filter id="shadow" x="-20%" y="-20%" width="150%" height="150%">
              <FeGaussianBlur in="SourceAlpha" stdDeviation={BLUR_RADIUS} />
              <FeOffset dx={0} dy={SHADOW_OFFSET} result="offsetblur" />
              <FeMerge>
                <FeMergeNode />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
          </Defs>
          <Path d={dPath} fill="white" filter="url(#shadow)" />
        </Svg>
      )}
      <TouchableWithoutFeedback onPress={onPress}>
        <View onLayout={onLayout} style={{ padding: 0 }}>
          {children}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
};

const PasoConfirmacion = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  
  // Acceso seguro al Store
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  
  // Cálculo manual del total porque no existe en el store
  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.price_unit * item.product_uom_qty), 0);
  };
  
  const { 
    datosEnvio, 
    clienteSeleccionado, 
    transporte, 
    notas: notasIniciales, 
    created_by_name,
    preCreatedOrderId // <--- ID DEL PEDIDO BORRADOR (si viene del paso anterior)
  } = route.params;

  const [notas, setNotas] = useState(notasIniciales || "");
  const [showExito, setShowExito] = useState(false);
  const [orderIdRef, setOrderIdRef] = useState("");
  
  // --- BLOQUEO DE DOBLE CLICK (Estado visual + Ref lógica inmediata) ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [tempNotas, setTempNotas] = useState("");

  const handleConfirmarPedido = async () => {
    // 1. Bloqueo inmediato para evitar el 3er pedido por "dedo rápido"
    if (isSubmitting || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const pedidoPayload = {
      // 2. Enviamos el ID del pedido borrador para que el backend lo actualice
      // en vez de crear uno nuevo (evita el 2do pedido duplicado)
      order_id_to_update: preCreatedOrderId || null,

      cliente_cuit: clienteSeleccionado.vat,
      items: items.map((item: ProductoCarrito) => ({
        product_id: item.product_id,
        qty: item.product_uom_qty,
        price_unit: item.price_unit,
        payment_term_id: item.payment_term_id,
        discount1: item.discount1 || 0,
        discount2: item.discount2 || 0,
        discount3: item.discount3 || 0,
        name: item.name
      })),
      partner_shipping_id: datosEnvio.id,
      payment_term_id: route.params.global_term_id,
      carrier_id: transporte?.id,
      observaciones: notas,
      created_by_name: created_by_name,
      transaction_id: transactionId
    };

    try {
      const response = await axios.post(`${API_URL}/crear-pedido`, pedidoPayload);

      if (response.status === 200 || response.status === 201) {
        setOrderIdRef(response.data.nro_pedido || String(response.data.pedido_id));
        clearCart();
        setShowExito(true);
        // NO desbloqueamos aquí porque ya navegamos al éxito
      } else {
        Alert.alert("Error", "No se pudo procesar el pedido.");
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    } catch (error: any) {
      console.error('Error al confirmar pedido:', error);
      const msg = error.response?.data?.error || "Error de conexión con el servidor.";
      Alert.alert("Error", msg);
      
      // Liberar bloqueo solo si hubo error
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const openModal = () => {
    setTempNotas(notas);
    setModalVisible(true);
  };

  const saveNotas = () => {
    setNotas(tempNotas);
    setModalVisible(false);
  };

  if (showExito) {
    return (
      <PantallaExitoPedido 
        nroPedido={orderIdRef} 
        onVolver={() => navigation.navigate('Home')} 
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <CarritoHeader title="Confirmación" step={3} />

      <LayoutRefresh>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <Text style={styles.sectionTitle}>Resumen final</Text>

          <ShapedCard style={styles.cardGap}>
            <View style={styles.innerCard}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardLabel}>CLIENTE</Text>
                  <Text style={styles.cardValue} numberOfLines={1}>{clienteSeleccionado.name}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>ENTREGA</Text>
                  <Text style={styles.cardValue} numberOfLines={2}>
                    {datosEnvio.calle}{datosEnvio.ciudad ? `, ${datosEnvio.ciudad}` : ""}
                  </Text>
                </View>
              </View>
              
              {transporte && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.cardLabel}>TRANSPORTE</Text>
                  <Text style={styles.cardValue}>{transporte.name || transporte.transporte}</Text>
                </>
              )}
            </View>
          </ShapedCard>

          <ShapedCard style={styles.cardGap} onPress={openModal}>
            <View style={styles.innerCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>NOTAS / OBSERVACIONES</Text>
                <Text style={styles.editText}>EDITAR</Text>
              </View>
              <Text style={[styles.cardValue, !notas && { color: '#AAA', fontStyle: 'italic' }]}>
                {notas || "Sin observaciones adicionales..."}
              </Text>
            </View>
          </ShapedCard>

          <ShapedCard style={{ marginBottom: 40 }}>
            <View style={styles.innerCard}>
              <Text style={styles.cardLabel}>TOTAL DEL PEDIDO</Text>
              <View style={styles.rowBaseline}>
                <Text style={styles.currencySymbol}>$</Text>
                <Text style={styles.totalValue}>{calculateTotal().toLocaleString()}</Text>
              </View>
              <Text style={styles.taxInfo}>IVA e impuestos incluidos</Text>
            </View>
          </ShapedCard>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => navigation.goBack()}
              disabled={isSubmitting}
            >
              <Text style={styles.backText}>VOLVER</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.confirm, isSubmitting && { backgroundColor: '#ccc' }]} 
              onPress={handleConfirmarPedido}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>CONFIRMAR</Text>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </LayoutRefresh>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={styles.modalBackground} />
          </TouchableWithoutFeedback>
          
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Observaciones</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Ej: Entregar después de las 14hs..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                value={tempNotas}
                onChangeText={setTempNotas}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.backText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={saveNotas}>
                <Text style={styles.confirmText}>GUARDAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2B2B2B',
    marginTop: 20,
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Barlow Condensed' : 'BarlowCondensed-Bold',
  },
  cardGap: {
    marginBottom: 20,
  },
  innerCard: {
    padding: 20,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C9BD8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2B2B2B',
  },
  editText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1C9BD8',
    textDecorationLine: 'underline',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE',
    marginVertical: 12,
  },
  rowBaseline: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C9BD8',
    marginRight: 4,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1C9BD8',
  },
  taxInfo: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  backBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2B2B2B',
    backgroundColor: '#fff'
  },
  backText: {
    color: '#2B2B2B',
    fontWeight: '800',
  },
  confirm: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#1C9BD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2B2B2B',
    marginBottom: 4,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#F9F9F9',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalBtnCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  modalBtnSave: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1C9BD8',
  },
});

export default PasoConfirmacion;