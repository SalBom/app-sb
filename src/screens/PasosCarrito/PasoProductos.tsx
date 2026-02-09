import React, { useRef, useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  Animated, 
  TouchableWithoutFeedback, 
  RefreshControl,
  Alert,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '../../store/cartStore';
import TarjetaProducto from '../../components/TarjetaProducto';
import CarritoHeader from '../../components/CarritoHeader';
import axios from 'axios';
import { Feather } from '@expo/vector-icons'; 
import Svg, { Path } from 'react-native-svg';

import { API_URL } from '../../config';

// --- GEOMETRÍA EXACTA ---
const SCREEN_W = Dimensions.get('window').width;
const PADDING_RIGHT = 15; 
const CARD_WIDTH = SCREEN_W - PADDING_RIGHT; 
const CARD_CUT_SIZE = 30; 

// La alerta termina EXACTAMENTE donde empieza el corte de la tarjeta
const ALERT_WIDTH = CARD_WIDTH - CARD_CUT_SIZE; 
const ALERT_HEIGHT = 34; 
const ALERT_INTERNAL_CUT = 12; 

// Path SVG: Rectángulo que llega hasta el corte
const alertPath = `
  M 0,0 
  H ${ALERT_WIDTH} 
  V ${ALERT_HEIGHT - ALERT_INTERNAL_CUT} 
  L ${ALERT_WIDTH - ALERT_INTERNAL_CUT},${ALERT_HEIGHT} 
  H 0 
  Z
`;

interface Props {
  onNext: () => void;
}

const PasoProductos: React.FC<Props> = ({ onNext }) => {
  const { items, updateQuantity, removeFromCart, updateItemPaymentTerm, updateDiscount } = useCartStore();
  const insets = useSafeAreaInsets();

  const [discountRules, setDiscountRules] = useState<any>({});
  const [stockMap, setStockMap] = useState<Record<number, string>>({});
  const [checkingStock, setCheckingStock] = useState(false);

  useEffect(() => { 
      fetchRules(); 
      checkStock(); 
  }, []);

  useEffect(() => {
      if (items.length > 0) checkStock();
  }, [items.length]);

  const fetchRules = () => {
    axios.get(`${API_URL}/admin/plazos-descuentos`)
        .then(res => setDiscountRules(res.data || {}))
        .catch(err => console.log('Error reglas:', err));
  };

  const checkStock = async () => {
      setCheckingStock(true);
      const newMap: Record<number, string> = {};
      try {
          await Promise.all(items.map(async (item) => {
              try {
                  const res = await axios.get(`${API_URL}/producto/${item.product_id}/info`);
                  newMap[item.product_id] = res.data.stock_state || 'green';
              } catch (e) {
                  newMap[item.product_id] = 'green';
              }
          }));
          setStockMap(newMap);
      } catch (e) {
          console.log("Error checking stock", e);
      } finally {
          setCheckingStock(false);
      }
  };

  const subtotalBase = items.reduce(
    (acc, item) => acc + (Number(item.price_unit) || 0) * (item.product_uom_qty || 1),
    0
  );

  const getItemDiscounts = (item: any) => {
      const price = Number(item.price_unit || 0);
      const listPrice = Number(item.list_price || 0);
      const isOffer = listPrice > 0 && price < (listPrice - 0.01);

      const rule = discountRules[item.payment_term_id];
      if (!rule) return { d1: 0, d2: 0, effectivePct: 0 };
      
      const minAmount = parseFloat(rule.min_compra || 0);
      
      if (subtotalBase >= minAmount) {
          let d1 = parseFloat(rule.descuento || 0);
          let d2 = parseFloat(rule.descuento2 || 0);

          if (isOffer) { d1 = 0; if (item.payment_term_id !== 1) d2 = 0; }

          const factor = (1 - d1/100) * (1 - d2/100);
          const effectivePct = (1 - factor) * 100;
          return { d1, d2, effectivePct };
      }
      return { d1: 0, d2: 0, effectivePct: 0 };
  };

  const totalConDescuentos = items.reduce((acc, item) => {
      const price = Number(item.price_unit || 0);
      const qty = item.product_uom_qty || 1;
      const { effectivePct } = getItemDiscounts(item);
      const finalPrice = effectivePct > 0 ? price * (1 - effectivePct / 100) : price;
      return acc + (finalPrice * qty);
  }, 0);

  const handleContinue = () => {
      const sinStock = items.filter(item => stockMap[item.product_id] === 'red');
      if (sinStock.length > 0) {
          Alert.alert("Stock Insuficiente", "Por favor elimina los productos marcados en rojo para continuar.", [{ text: "Entendido" }]);
          return;
      }
      items.forEach(item => {
          const { d1, d2 } = getItemDiscounts(item);
          updateDiscount(item.product_id, { discount1: d1, discount2: d2 });
      });
      setTimeout(onNext, 150);
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRules();
    checkStock(); 
    setTimeout(() => setRefreshing(false), 1000);
  }, []);
  
  const pressAnim = useRef(new Animated.Value(0)).current; 
  const handlePressIn = () => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const handlePressOut = () => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });
  
  const renderItem = ({ item }: any) => {
    const { effectivePct } = getItemDiscounts(item);
    const isOutOfStock = stockMap[item.product_id] === 'red';

    return (
        <View style={styles.itemContainer}> 
            <View style={{ zIndex: 2 }}> 
                <TarjetaProducto
                  product_id={item.product_id}
                  name={item.name}
                  brand={item.brand || 'SHIMURA'}
                  code={item.default_code || 'SH-S10'}
                  price={item.price_unit}
                  listPrice={item.list_price}
                  quantity={item.product_uom_qty}
                  image_1920={item.image_1920}
                  image_md_url={item.image_md_url}
                  image_thumb_url={item.image_thumb_url}
                  paymentTermId={item.payment_term_id}
                  discountPct={effectivePct}
                  discountRules={discountRules} 
                  onPaymentTermChange={(newId) => updateItemPaymentTerm(item.product_id, newId)}
                  onAdd={() => updateQuantity(item.product_id, item.product_uom_qty + 1)}
                  onSubtract={() => updateQuantity(item.product_id, Math.max(1, item.product_uom_qty - 1))}
                  onDelete={() => removeFromCart(item.product_id)}
                />
            </View>

            {/* AVISO SIN STOCK CON TEXTO ANIDADO (BOLD/REGULAR) */}
            {isOutOfStock && (
                <View style={styles.alertWrapper}>
                    <View style={StyleSheet.absoluteFill}>
                        <Svg width={ALERT_WIDTH} height={ALERT_HEIGHT}>
                            <Path d={alertPath} fill="#EF4444" />
                        </Svg>
                    </View>
                    <View style={styles.alertContent}>
                        <Feather name="alert-circle" size={14} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.stockAlertText}>
                            SIN STOCK - <Text style={styles.boldText}>ELIMINAR</Text>
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.product_id.toString()}
        ListHeaderComponent={<CarritoHeader step={1} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1C9BD8']} tintColor="#1C9BD8" />}
      />

      <View style={[styles.footerContainer, { paddingBottom: Math.max(20, insets.bottom + 40) }]}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>TOTAL</Text>
          <Text style={styles.subtotalAmount}>
            USD {totalConDescuentos.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        <TouchableWithoutFeedback onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleContinue}>
          <Animated.View style={[
              styles.botonContinuar, 
              { transform: [{ scale }, { translateY }], opacity: checkingStock ? 0.7 : 1 }
          ]}>
            {checkingStock ? (
                <ActivityIndicator color="#FFF" size="small" />
            ) : (
                <Text style={styles.botonContinuarTexto}>CONTINUAR</Text>
            )}
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  itemContainer: {
      marginBottom: 2, 
  },

  alertWrapper: {
      width: ALERT_WIDTH, 
      height: ALERT_HEIGHT,
      marginTop: -20, 
      marginLeft: 0,
      zIndex: 1, 
      justifyContent: 'flex-end', 
      paddingBottom: 6,
      alignSelf: 'flex-start', 
  },
  
  alertContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      paddingLeft: 0
  },

  stockAlertText: {
      color: '#FFF',
      fontFamily: 'BarlowCondensed-Regular', // Regular por defecto
      fontSize: 13,
      letterSpacing: 0.5,
      marginTop: 2 
  },
  
  boldText: {
      fontFamily: 'BarlowCondensed-Bold', // Negrita solo para "ELIMINAR"
  },

  footerContainer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
    paddingHorizontal: 20, paddingTop: 15, shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 5, zIndex: 100,
  },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  subtotalLabel: { color: '#313131', fontSize: 16, fontFamily: 'BarlowCondensed-Light', textTransform: 'uppercase' },
  subtotalAmount: { color: '#313131', fontSize: 28, fontFamily: 'BarlowCondensed-SemiBold', fontWeight: '600' },
  botonContinuar: { backgroundColor: '#1C9BD8', height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  botonContinuarTexto: { color: '#fff', fontSize: 16, fontFamily: 'BarlowCondensed-Bold', fontWeight: '700', letterSpacing: 1 },
});

export default PasoProductos;