import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, FlatList, Pressable, ImageBackground,
  Image as RNImage, Dimensions, Animated, Easing, ActivityIndicator, Alert, TouchableWithoutFeedback,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCuitFromStorage } from '../../utils/authStorage';
import CarritoHeader from '../../components/CarritoHeader';
import { useCartStore } from '../../store/cartStore';
import LayoutRefresh from '../../components/LayoutRefresh'; 

// SVGs
import PlaceIcon from '../../../assets/place.svg';
import RetiroIcon from '../../../assets/retiro.svg';
import { Ionicons } from '@expo/vector-icons';

interface Props { onNext: () => void; onBack: () => void; }
type Cliente = { id: number; name: string; vat?: string | null; street?: string; city?: string; state?: string; zip?: string; is_self?: boolean; };
type Plazo = { id: number; nombre: string };
type MetodoEnvio = 'domicilio' | 'sucursal' | null;
type Address = { id?: number | string; name?: string; street?: string; city?: string; state?: string; zip?: string; source?: 'partner' | 'delivery_child'; };

const BG_PICKERS = require('../../../assets/contenedorPicker.png');
const { width: P_W, height: P_H } = RNImage.resolveAssetSource(BG_PICKERS);
const PICKER_RATIO = P_W / P_H;
const BG_ENVIO = require('../../../assets/contenedorEnvio.png');
const { width: E_W, height: E_H } = RNImage.resolveAssetSource(BG_ENVIO);
const ENVIO_RATIO = E_W / E_H;
const BG_DIRECCION = require('../../../assets/contenedorDireccion.png');

const SIDE_MARGIN = 10;
const CARD_HSCALE = 1.45; // <--- Aumentado para más espacio
const ENV_CARD_HSCALE = 1.18;
const PICKER_HEIGHT = 46;
const PICKER_RADIUS = 14;
import { API_URL } from '../../config';

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

function normalizeClientes(lista: any[]): Cliente[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((c: any) => ({
    id: c.id ?? c.partner_id ?? c.partnerId,
    name: c.name ?? c.display_name ?? c.razon_social ?? c.nombre,
    vat: c.vat ?? c.cuit ?? null,
    street: c.street ?? c.calle ?? '',
    city: c.city ?? c.ciudad ?? '',
    state: (Array.isArray(c.state_id) ? c.state_id[1] : c.state) ?? '',
    zip: c.zip ?? c.codigo_postal ?? '',
  })).filter(x => x.id && x.name);
}

const toNum = (v:any)=> (typeof v==='number'? v : Number(String(v).replace(/\./g,'').replace(',','.'))||0);

const PasoDatos: React.FC<Props> = ({ onNext, onBack }) => {
  const insets = useSafeAreaInsets();
  const { items, plazoSeleccionado } = useCartStore(); 
  const setStore = (useCartStore as any).setState;
  const getStore = (useCartStore as any).getState;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [plazosData, setPlazosData] = useState<Plazo[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [metodoEnvio, setMetodoEnvio] = useState<MetodoEnvio>(null);
  const [modal, setModal] = useState<{ open: boolean; type: 'cliente' | 'direccion' | null }>({ open: false, type: null });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrSelected, setAddrSelected] = useState<Address | null>(null);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientes;
    const text = clientSearch.toLowerCase().trim();
    return clientes.filter(c => (c.name && c.name.toLowerCase().includes(text)) || (c.vat && String(c.vat).includes(text)));
  }, [clientes, clientSearch]);

  const clienteSel = useMemo(() => clientes.find(c => c.id === clienteId) ?? null, [clientes, clienteId]);

  const nombrePlazoMaximo = useMemo(() => {
    if (!plazoSeleccionado || !plazosData.length) return 'Calculando...';
    const term = plazosData.find(p => p.id === (plazoSeleccionado as any).id);
    return term ? term.nombre : 'Plazo no encontrado';
  }, [plazoSeleccionado, plazosData]);

  const cardW = Math.max(0, Dimensions.get('window').width - SIDE_MARGIN * 2);
  const pickersH = Math.round((cardW / PICKER_RATIO) * CARD_HSCALE);
  const envioH   = Math.round((cardW / ENVIO_RATIO) * ENV_CARD_HSCALE);

  const cargarDatos = useCallback(async () => {
    try {
      const cuit = await getCuitFromStorage();
      if (!cuit) return;

      let selfAsCliente: Cliente | null = null;
      const resPerfil = await safeFetch(`${API_URL}/usuario-perfil?cuit=${encodeURIComponent(cuit)}`);
      if (resPerfil.ok && resPerfil.data && resPerfil.data.partner_id) {
          selfAsCliente = { id: resPerfil.data.partner_id, name: `YO: ${resPerfil.data.name}`.toUpperCase(), vat: cuit, is_self: true };
      }

      const resTC = await safeFetch(`${API_URL}/tipo-cambio`);
      setTipoCambio(resTC.ok ? (resTC.data?.inverse_rate || 1290) : 1290);

      const resP = await safeFetch(`${API_URL}/plazos-pago`);
      if (resP.ok) setPlazosData(resP.data || []);

      setLoadingClientes(true);
      
      // --- CAMBIO CLAVE: Usamos /clients en lugar de /clientes-del-vendedor ---
      const resCli = await safeFetch(`${API_URL}/clients?cuit=${encodeURIComponent(cuit)}`);
      
      // Ajuste para soportar tanto array directo (nuevo endpoint) como objeto (viejo)
      let rawList = [];
      if (resCli.ok) {
          rawList = Array.isArray(resCli.data) ? resCli.data : (resCli.data.items || []);
      }
      
      let normList = normalizeClientes(rawList);
      
      if (selfAsCliente) {
          const yaEsta = normList.some(c => c.id === selfAsCliente!.id);
          if (!yaEsta) normList = [selfAsCliente, ...normList];
      }
      setClientes(normList);
      if (normList.length > 0 && !clienteId) setClienteId(normList[0].id);
      setLoadingClientes(false);
    } catch (e) { setLoadingClientes(false); }
  }, [clienteId]);

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    let active = true;
    if (!clienteId || metodoEnvio !== 'domicilio') { setAddresses([]); setAddrSelected(null); return; }
    const timer = setTimeout(async () => {
        if(!active) return;
        setLoadingAddress(true); 
        const res = await safeFetch(`${API_URL}/cliente-direcciones?cliente_id=${clienteId}`);
        if (!active) return;
        let lista: Address[] = [];
        if (res.ok && Array.isArray(res.data)) {
            lista = res.data.map((d:any) => ({
                id: d.id, name: d.name ?? 'DIRECCIÓN', street: d.street ?? '', city: d.city ?? '', state: d.state ?? '', zip: d.zip ?? '',
                source: d.source === 'partner' ? 'partner' : 'delivery_child'
            }));
        } else if (clienteSel) {
            lista.push({ id: 'partner', name: 'DIRECCIÓN PRINCIPAL', street: clienteSel.street || '', city: clienteSel.city || '', state: clienteSel.state || '', zip: clienteSel.zip || '' });
        }
        setAddresses(lista);
        setAddrSelected(lista[0] || null);
        setLoadingAddress(false);
    }, 100); 
    return () => { active = false; clearTimeout(timer); };
  }, [clienteId, metodoEnvio, clienteSel]); 

  const ready = !!clienteId && !!plazoSeleccionado && !!metodoEnvio;
  const deliveryName = (addrSelected?.name || 'DOMICILIO DE ENTREGA').trim();
  const deliveryAddress = [addrSelected?.street, addrSelected?.city, addrSelected?.state, addrSelected?.zip].filter(Boolean).join(', ');

  const handleContinuar = async () => {
    const clienteObj = clienteSel ? { id: clienteSel.id, name: clienteSel.name, vat: clienteSel.vat } : null;
    const plazoIdFinal = (plazoSeleccionado as any)?.id;
    if (!clienteObj?.id || !plazoIdFinal) { Alert.alert('Faltan datos', 'Seleccioná un cliente válido.'); return; }

    setStore({ clienteSeleccionado: clienteObj, envioSeleccionado: metodoEnvio, direccionEntrega: metodoEnvio === 'domicilio' && addrSelected ? { ...addrSelected } : null });

    try {
        const odooItems = items.map((it: any) => ({
            product_id: it.product_id, product_uom_qty: it.product_uom_qty ?? 1, price_unit: Number(it.price_unit ?? 0),
            discount1: Number(it.discount1 ?? 0), discount2: Number(it.discount2 ?? 0),
            payment_term_id: it.payment_term_id,
            ...(metodoEnvio === 'sucursal' && Number(it.product_id) === 4011 ? { name: 'RETIRO EN CC' } : {}),
        }));

        const existingOrderId = getStore().orderId;
        const payload: any = { cliente_cuit: clienteObj.vat, payment_term_id: plazoIdFinal, items: odooItems };
        if (metodoEnvio === 'domicilio' && addrSelected && typeof addrSelected.id === 'number') payload.partner_shipping_id = addrSelected.id;
        if (metodoEnvio === 'sucursal') payload.carrier_id = 926;
        
        // --- CAMBIO CLAVE: Usamos 'order_id_to_update' para reciclar el pedido ---
        if (existingOrderId) payload.order_id_to_update = existingOrderId;

        const url = `${API_URL}/crear-pedido`;
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await resp.json();

        if (resp.ok && !d.error) {
            if (d.pedido_id) setStore({ orderId: Number(d.pedido_id) });
            setStore({ consultaResumen: { consulta_id: d.pedido_id, name: d.nro_pedido, currency: d.currency || 'USD', base_imponible: d.base_imponible ?? 0, total: d.total ?? 0, tax_totals: { groups: Array.isArray(d.groups) ? d.groups : [], raw: d.tax_totals || null } } });
            onNext();
        } else { Alert.alert('Error', d.error || 'No se pudo procesar.'); }
    } catch (e) { Alert.alert('Error de conexión', 'Verifica tu internet.'); }
  };

  return (
    <View style={styles.container}>
      <LayoutRefresh onRecargar={cargarDatos} contentContainerStyle={[styles.scrollContent, { paddingBottom: 10 + insets.bottom }]}>
        <CarritoHeader step={2} />
        <View style={[styles.cardWrap, { width: cardW }]}>
          <ImageBackground source={BG_PICKERS} style={[styles.cardBg, { width: cardW, height: pickersH }]} resizeMode="stretch">
            <View style={styles.cardContent}>
              <DropdownField valueText={clienteSel?.name ?? 'Seleccionar Cliente'} onPress={() => { setClientSearch(''); setModal({ open: true, type: 'cliente' }); }} />
              <View style={{ height: 16 }} />
              <View style={styles.plazoInfoBox}>
                  <Text style={styles.plazoLabel}>PLAZO GENERAL DEL PEDIDO (MÁXIMO):</Text>
                  <Text style={styles.plazoValue}>{nombrePlazoMaximo}</Text>
                  <Text style={styles.plazoSub}>Calculado automáticamente según los ítems de tu carrito.</Text>
              </View>
            </View>
          </ImageBackground>
        </View>

        <View style={[styles.cardWrap, { width: cardW, marginTop: 14 }]}>
          <ImageBackground source={BG_ENVIO} style={[styles.cardBg, styles.envioBg, { width: cardW, height: envioH }]} resizeMode="stretch">
            <Text style={styles.envioTitle}>MÉTODO DE ENVÍO</Text>
            <View style={styles.envioRow}>
              <OptionPill label={'ENVÍO A\nDOMICILIO'} selected={metodoEnvio === 'domicilio'} dimmed={metodoEnvio === 'sucursal'} onPress={() => setMetodoEnvio('domicilio')} />
              <View style={{ width: 14 }} />
              <OptionPill label={'RETIRO EN\nSUCURSAL'} selected={metodoEnvio === 'sucursal'} dimmed={metodoEnvio === 'domicilio'} onPress={() => setMetodoEnvio('sucursal')} />
            </View>
            {metodoEnvio === 'domicilio' && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.dirTitle}>DIRECCIÓN DE ENVÍO</Text>
                <ImageBackground source={BG_DIRECCION} style={[styles.direccionCard, { width: cardW - 36 }]} resizeMode="stretch">
                  <View style={styles.dirRow}>
                    <PlaceIcon width={20} height={20} style={styles.dirIconSvg} />
                    <View style={{flex:1}}>{loadingAddress ? <Text style={styles.dirLocal}>Buscando dirección...</Text> : <><Text style={styles.dirLocal}>{deliveryName}</Text><Text style={styles.dirAddress}>{deliveryAddress || '—'}</Text></>}</View>
                  </View>
                  <Pressable style={styles.changeBtn} onPress={() => setModal({ open: true, type: 'direccion' })}><Text style={styles.changeBtnText}>CAMBIAR DIRECCIÓN</Text></Pressable>
                </ImageBackground>
              </View>
            )}
            {metodoEnvio === 'sucursal' && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.dirTitle}>DIRECCIÓN DE RETIRO</Text>
                <ImageBackground source={BG_DIRECCION} style={[styles.direccionCard, { width: cardW - 36 }]} resizeMode="stretch">
                  <View style={styles.dirRow}>
                    <RetiroIcon width={20} height={20} style={styles.dirIconSvg} />
                    <View><Text style={styles.dirLocal}>MEDLOG SARANDÍ</Text><Text style={styles.dirAddress}>Nicaragua 1651, Sarandí, Buenos Aires B1876</Text></View>
                  </View>
                </ImageBackground>
              </View>
            )}
          </ImageBackground>
        </View>
      </LayoutRefresh>

      <View style={[styles.footerContainer, { paddingBottom: Math.max(20, insets.bottom + 35) }]}>
        <View style={styles.buttonsRow}>
            <TouchableOpacity onPress={onBack} style={styles.btnVolver}><Text style={styles.btnTextVolver}>VOLVER</Text></TouchableOpacity>
            <TouchableOpacity disabled={!ready} onPress={handleContinuar} style={[styles.btnContinuar, !ready && { opacity: 0.5 }]}><Text style={styles.btnTextContinuar}>CONTINUAR</Text></TouchableOpacity>
        </View>
      </View>

      <Modal visible={modal.open} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modal.type === 'cliente' ? 'Seleccionar cliente' : 'Seleccionar dirección'}</Text>
            {modal.type === 'cliente' && (
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999" /><TextInput style={styles.searchInput} placeholder="Buscar cliente..." value={clientSearch} onChangeText={setClientSearch} />
              </View>
            )}
            <FlatList data={(modal.type === 'cliente' ? filteredClients : addresses) as any[]} keyExtractor={(item: any, idx) => String(item.id ?? idx)} renderItem={({ item }: any) => (
                <Pressable style={styles.modalItem} onPress={() => { if (modal.type === 'cliente') { setClienteId(item.id); setAddresses([]); setAddrSelected(null); } else setAddrSelected(item); setModal({ open: false, type: null }); }}>
                  <Text style={[styles.modalItemText, item.is_self && { color: '#139EDB', fontWeight: 'bold' }]}>{item.name}</Text>
                </Pressable>
              )} />
            <Pressable style={styles.modalClose} onPress={() => setModal({ open: false, type: null })}><Text style={styles.modalCloseText}>CERRAR</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DropdownField: React.FC<{ valueText: string; onPress: () => void }> = ({ valueText, onPress }) => (
  <View style={{ width: '100%' }}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.select, pressed && { opacity: 0.9 }]}>
      <Text style={styles.selectText} numberOfLines={1} ellipsizeMode="tail">{valueText}</Text>
      <Text style={styles.chevron}>▾</Text>
    </Pressable>
  </View>
);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const OptionPill: React.FC<{ label: string; selected: boolean; dimmed?: boolean; onPress: () => void }> = ({ label, selected, dimmed = false, onPress }) => {
  const opacity = useRef(new Animated.Value(dimmed ? 0.35 : 1)).current;
  useEffect(() => { Animated.timing(opacity, { toValue: dimmed ? 0.35 : 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, [dimmed]);
  return (
    <AnimatedPressable onPress={onPress} style={[styles.envioPill, selected && styles.envioPillSelected, { opacity }]}>
      <Text style={[styles.envioPillText, selected && styles.envioPillTextSelected]}>{label}</Text>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { paddingBottom: 40 },
  cardWrap: { alignSelf: 'center', marginHorizontal: SIDE_MARGIN, marginTop: 10 },
  cardBg: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 25 }, // Ajustado el padding interno
  envioBg: { paddingTop: 18, paddingBottom: 18 },
  cardContent: { flex: 1, justifyContent: 'center' },
  select: { height: PICKER_HEIGHT, borderRadius: PICKER_RADIUS, paddingHorizontal: 10, backgroundColor: '#EEF0F2', borderWidth: 1, borderColor: '#E7EAED', flexDirection: 'row', alignItems: 'center' },
  selectText: { flex: 1, fontSize: 14, color: '#121212', fontWeight: '700' },
  chevron: { fontSize: 16, opacity: 0.6 },
  plazoInfoBox: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  plazoLabel: { fontSize: 9, fontFamily: 'BarlowCondensed-Bold', color: '#6B7280', marginBottom: 2 },
  plazoValue: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold', color: '#1C9BD8' },
  plazoSub: { fontSize: 9, fontFamily: 'BarlowCondensed-Regular', color: '#9CA3AF', marginTop: 2 },
  envioTitle: { fontSize: 20, fontWeight: '800', color: '#2B2B2B', marginBottom: 12 },
  envioRow: { flexDirection: 'row', alignItems: 'center' },
  envioPill: { flex: 1, backgroundColor: '#F3F4F6', borderColor: '#E7EAED', borderWidth: 1, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  envioPillSelected: { backgroundColor: '#00A0E3', borderColor: '#00A0E3' },
  envioPillText: { textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#2B2B2B', lineHeight: 22 },
  envioPillTextSelected: { color: '#FFFFFF' },
  dirTitle: { fontSize: 16, fontWeight: '800', color: '#2B2B2B', marginBottom: 8 },
  direccionCard: { padding: 14, borderRadius: 12, overflow: 'hidden', alignSelf: 'center' },
  dirRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dirIconSvg: { marginRight: 8 },
  dirLocal: { fontSize: 14, fontWeight: '800', color: '#2B2B2B' },
  dirAddress: { fontSize: 13, color: '#555', marginTop: 2 },
  changeBtn: { alignSelf: 'flex-end', backgroundColor: '#E6E7EA', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  changeBtnText: { fontSize: 10, fontWeight: '800', color: '#333' },
  footerContainer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15, paddingHorizontal: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 5 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 8 },
  btnVolver: { flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  btnTextVolver: { color: '#2B2B2B', fontWeight: '800' },
  btnContinuar: { flex: 1, height: 46, borderRadius: 999, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  btnTextContinuar: { color: '#fff', fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  loadingText: { marginLeft: 8, color: '#333', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E7EAED' },
  modalItemText: { fontSize: 16 },
  modalClose: { alignSelf: 'center', marginVertical: 12, paddingHorizontal: 16, paddingVertical: 10 },
  modalCloseText: { fontWeight: '700', color: '#1C9BD8' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, borderRadius: 8, height: 45, borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#333', fontWeight: '500' },
});

export default PasoDatos;