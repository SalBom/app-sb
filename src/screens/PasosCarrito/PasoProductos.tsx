import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
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
  Dimensions,
  Modal,
  TextInput,
  Pressable
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore, ClienteSel } from '../../store/cartStore';
import TarjetaProducto from '../../components/TarjetaProducto';
import CarritoHeader from '../../components/CarritoHeader';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons'; 

import { getCuitFromStorage } from '../../utils/authStorage';
import { API_URL } from '../../config';
import useIsDesktopWeb from '../../hooks/useIsDesktopWeb';

// --- HELPERS PARA CLIENTES ---
async function safeFetch(url: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { ok: res.ok, data: json };
    } catch (err) { return { ok: false, data: null }; }
  } catch (e) { return { ok: false, data: null }; }
}

function normalizeClientes(lista: any[]): ClienteSel[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((c: any) => {
    let tData = c.app_transport_data || null;
    if (!tData && Array.isArray(c.property_delivery_carrier_id) && c.property_delivery_carrier_id.length === 2) {
        tData = { id: c.property_delivery_carrier_id[0], name: c.property_delivery_carrier_id[1] };
    }
    return {
      id: c.id ?? c.partner_id ?? c.partnerId,
      name: c.name ?? c.display_name ?? c.razon_social ?? c.nombre,
      vat: c.vat ?? c.cuit ?? null,
      street: c.street ?? c.calle ?? '',
      city: c.city ?? c.ciudad ?? '',
      state: (Array.isArray(c.state_id) ? c.state_id[1] : c.state) ?? '',
      zip: c.zip ?? c.codigo_postal ?? '',
      transport_data: tData 
    };
  }).filter(x => x.id && x.name);
}

interface Props {
  onNext: () => void;
}

const PasoProductos: React.FC<Props> = ({ onNext }) => {
  const {
      items, updateQuantity, removeFromCart, updateItemPaymentTerm, updateDiscount,
      clienteSeleccionado, setCliente, setTransporteObj, setTransporte,
      plazoSeleccionado, setGlobalPaymentTerm
  } = useCartStore();
  
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();

  const [discountRules, setDiscountRules] = useState<any>({});
  const [stockMap, setStockMap] = useState<Record<number, string>>({});
  const [checkingStock, setCheckingStock] = useState(false);

  // --- PLAZO DE PAGO GENERAL DEL PEDIDO ---
  const [plazos, setPlazos] = useState<{ id: number; nombre: string }[]>([]);
  const [modalPlazo, setModalPlazo] = useState(false);

  // --- ESTADOS DE CLIENTES ---
  const [clientes, setClientes] = useState<ClienteSel[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientes;
    const text = clientSearch.toLowerCase().trim();
    return clientes.filter(c => (c.name && c.name.toLowerCase().includes(text)) || (c.vat && String(c.vat).includes(text)));
  }, [clientes, clientSearch]);

  const cargarClientes = useCallback(async () => {
    try {
      setLoadingClientes(true);
      const cuit = await getCuitFromStorage();
      if (!cuit) return;

      let selfAsCliente: ClienteSel | null = null;
      const resPerfil = await safeFetch(`${API_URL}/usuario-perfil?cuit=${encodeURIComponent(cuit)}`);
      if (resPerfil.ok && resPerfil.data && resPerfil.data.partner_id) {
          selfAsCliente = { id: resPerfil.data.partner_id, name: `YO: ${resPerfil.data.name}`.toUpperCase(), vat: cuit, is_self: true };
      }

      const resCli = await safeFetch(`${API_URL}/clientes-del-vendedor?cuit=${encodeURIComponent(cuit)}`);
      let normList = normalizeClientes(resCli.ok ? resCli.data.items : []);
      if (selfAsCliente) {
          const yaEsta = normList.some(c => c.id === selfAsCliente!.id);
          if (!yaEsta) normList = [selfAsCliente, ...normList];
      }
      setClientes(normList);
      
      if (normList.length > 0 && !clienteSeleccionado) {
          handleSelectCliente(normList[0]);
      }
      setLoadingClientes(false);
    } catch (e) {
      setLoadingClientes(false);
    }
  }, [clienteSeleccionado]);

  useEffect(() => {
      fetchRules();
      fetchPlazos();
      checkStock();
      cargarClientes();
  }, []);

  useEffect(() => {
      if (items.length > 0) checkStock();
  }, [items.length]);

  const handleSelectCliente = (item: ClienteSel) => {
    setCliente(item);
    if (item.transport_data) {
        setTransporteObj(item.transport_data);
        setTransporte(item.transport_data.name);
    } else {
        setTransporteObj(null);
        setTransporte(null);
    }
    setModalCliente(false);
  };

  const fetchRules = () => {
    axios.get(`${API_URL}/admin/plazos-descuentos`)
        .then(res => setDiscountRules(res.data || {}))
        .catch(err => console.log('Error reglas:', err));
  };

  // Mismos IDs de plazo habilitados que usa la card de producto (TarjetaProducto).
  const PLAZOS_HABILITADOS = [1, 21, 22, 24, 31];
  const fetchPlazos = () => {
    axios.get(`${API_URL}/plazos-pago`)
        .then(res => {
            if (Array.isArray(res.data)) {
                const filtrados = res.data
                    .filter((t: any) => PLAZOS_HABILITADOS.includes(t.id))
                    .sort((a: any, b: any) => a.id - b.id);
                setPlazos(filtrados);
            }
        })
        .catch(err => console.log('Error plazos:', err));
  };

  // Al cargar la lista de plazos, normalizamos el pedido a un plazo GENERAL único:
  // si ya había uno seleccionado y sigue habilitado lo respetamos, si no tomamos
  // el primero. setGlobalPaymentTerm unifica el payment_term_id de todos los ítems.
  useEffect(() => {
    if (plazos.length === 0) return;
    const actual = plazos.find(p => p.id === plazoSeleccionado?.id);
    const elegido = actual || plazos[0];
    setGlobalPaymentTerm({ id: elegido.id, nombre: elegido.nombre });
  }, [plazos]);

  const plazoActualNombre = plazos.find(p => p.id === plazoSeleccionado?.id)?.nombre;

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
      if (!clienteSeleccionado) {
          Alert.alert("Atención", "Por favor seleccioná un cliente para el pedido.", [{ text: "Entendido" }]);
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
    cargarClientes();
    setTimeout(() => setRefreshing(false), 1000);
  }, []);
  
  const pressAnim = useRef(new Animated.Value(0)).current; 
  const handlePressIn = () => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const handlePressOut = () => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });
  
  const renderItem = ({ item }: any) => {
    const { effectivePct } = getItemDiscounts(item);

    return (
        <View style={styles.itemContainer}> 
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
                termReadOnly
                onPaymentTermChange={(newId) => updateItemPaymentTerm(item.product_id, newId)}
                onAdd={() => updateQuantity(item.product_id, item.product_uom_qty + 1)}
                onSubtract={() => updateQuantity(item.product_id, Math.max(1, item.product_uom_qty - 1))}
                onDelete={() => removeFromCart(item.product_id)}
            />
        </View>
    );
  };

  const listHeader = (
    <View style={styles.headerContainerWrapper}>
        <CarritoHeader step={1} />
        
        <View style={styles.clientSelectorWrapper}>
            <Text style={styles.clientLabel}>CLIENTE SELECCIONADO</Text>
            <Pressable
                onPress={() => { setClientSearch(''); setModalCliente(true); }}
                style={({ pressed }) => [styles.select, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.selectText} numberOfLines={1} ellipsizeMode="tail">
                  {clienteSeleccionado?.name ?? (loadingClientes ? 'Cargando...' : 'Seleccionar Cliente')}
              </Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>
        </View>

        <View style={styles.clientSelectorWrapper}>
            <Text style={styles.clientLabel}>PLAZO DE PAGO</Text>
            <Pressable
                onPress={() => setModalPlazo(true)}
                style={({ pressed }) => [styles.select, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.selectText} numberOfLines={1} ellipsizeMode="tail">
                  {plazoActualNombre ?? (plazos.length === 0 ? 'Cargando...' : 'Seleccionar plazo')}
              </Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>
        </View>
    </View>
  );

  return (
    <View style={[styles.container, isDesktopWeb && styles.containerDesktop]}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.product_id.toString()}
        ListHeaderComponent={listHeader}
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

      <Modal visible={modalCliente} animationType={isDesktopWeb ? 'fade' : 'slide'} transparent>
        <View style={isDesktopWeb ? styles.modalBackdropDesktop : styles.modalBackdrop}>
          <View style={isDesktopWeb ? styles.modalCardDesktop : styles.modalCard}>
            <Text style={styles.modalTitle}>Seleccionar cliente</Text>
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999" />
                <TextInput 
                    style={styles.searchInput} 
                    placeholder="Buscar cliente..." 
                    value={clientSearch} 
                    onChangeText={setClientSearch} 
                />
            </View>
            <FlatList 
                data={filteredClients} 
                keyExtractor={(item: any, idx) => String(item.id ?? idx)} 
                renderItem={({ item }: any) => (
                    <Pressable style={styles.modalItem} onPress={() => handleSelectCliente(item)}>
                        <Text style={[styles.modalItemText, item.is_self && { color: '#139EDB', fontWeight: 'bold' }]}>
                            {item.name}
                        </Text>
                    </Pressable>
                )} 
            />
            <Pressable style={styles.modalClose} onPress={() => setModalCliente(false)}>
                <Text style={styles.modalCloseText}>CERRAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={modalPlazo} animationType={isDesktopWeb ? 'fade' : 'slide'} transparent>
        <View style={isDesktopWeb ? styles.modalBackdropDesktop : styles.modalBackdrop}>
          <View style={isDesktopWeb ? styles.modalCardDesktop : styles.modalCard}>
            <Text style={styles.modalTitle}>Plazo de pago</Text>
            <FlatList
                data={plazos}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                    const isSel = item.id === plazoSeleccionado?.id;
                    return (
                        <Pressable
                            style={styles.modalItem}
                            onPress={() => { setGlobalPaymentTerm({ id: item.id, nombre: item.nombre }); setModalPlazo(false); }}
                        >
                            <Text style={[styles.modalItemText, isSel && { color: '#139EDB', fontWeight: 'bold' }]}>
                                {item.nombre}
                            </Text>
                        </Pressable>
                    );
                }}
            />
            <Pressable style={styles.modalClose} onPress={() => setModalPlazo(false)}>
                <Text style={styles.modalCloseText}>CERRAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  // Desktop: se centra el contenido en una columna de ancho razonable en vez de
  // estirarse borde a borde en pantallas anchas.
  containerDesktop: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  headerContainerWrapper: { paddingBottom: 15 },
  clientSelectorWrapper: { paddingHorizontal: 20, marginTop: 10 },
  clientLabel: { fontSize: 12, fontFamily: 'BarlowCondensed-SemiBold', color: '#6B7280', marginBottom: 6, marginLeft: 4 },
  select: { height: 46, borderRadius: 14, paddingHorizontal: 15, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E7EAED', flexDirection: 'row', alignItems: 'center' },
  selectText: { flex: 1, fontSize: 14, color: '#121212', fontWeight: '700' },
  chevron: { fontSize: 16, opacity: 0.6 },
  itemContainer: { marginBottom: 2 },
  footerContainer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingHorizontal: 20, paddingTop: 15, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 5, zIndex: 100 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  subtotalLabel: { color: '#313131', fontSize: 16, fontFamily: 'BarlowCondensed-Light', textTransform: 'uppercase' },
  subtotalAmount: { color: '#313131', fontSize: 28, fontFamily: 'BarlowCondensed-SemiBold', fontWeight: '600' },
  botonContinuar: { backgroundColor: '#1C9BD8', height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  botonContinuarTexto: { color: '#fff', fontSize: 16, fontFamily: 'BarlowCondensed-Bold', fontWeight: '700', letterSpacing: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12 },
  // Desktop: diálogo centrado y compacto en vez de la hoja mobile que sube desde abajo.
  modalBackdropDesktop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  modalCardDesktop: { backgroundColor: '#fff', width: 440, maxHeight: 520, borderRadius: 16, paddingTop: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, borderRadius: 8, height: 45, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#333', fontWeight: '500' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E7EAED' },
  modalItemText: { fontSize: 16 },
  modalClose: { alignSelf: 'center', marginVertical: 12, paddingHorizontal: 16, paddingVertical: 10 },
  modalCloseText: { fontWeight: '700', color: '#1C9BD8' },
});

export default PasoProductos;