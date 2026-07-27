// src/components/MasterboxAdminModal.tsx
// Administración de MASTERBOX (solo ADMIN): productos que se venden por caja.
// Cada fila = un SKU + cuántas unidades trae la caja. Cuando el vendedor suma
// 1 de estos productos, la app le carga esa cantidad de unidades al carrito.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, TextInput, ScrollView, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import { cargarMasterbox } from '../config/masterbox';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type Item = { sku: string; units: number };

const MasterboxAdminModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const isDesktopWeb = useIsDesktopWeb();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nuevoSku, setNuevoSku] = useState('');
  const [nuevoUnits, setNuevoUnits] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const cuit = await getCuitFromStorage();
      const res = await axios.get(`${API_URL}/admin/masterbox`, { params: { cuit } });
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar la lista.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) { cargar(); setNuevoSku(''); setNuevoUnits(''); setError(''); }
  }, [visible]);

  const guardar = async (sku: string, units: number) => {
    setSaving(true);
    setError('');
    try {
      const cuit = await getCuitFromStorage();
      await axios.post(`${API_URL}/admin/masterbox`, { cuit, sku, units });
      await cargar();
      await cargarMasterbox(); // refresca el mapa que usa la app en vivo
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const agregar = async () => {
    const sku = nuevoSku.trim().toUpperCase();
    const units = parseInt(nuevoUnits, 10);
    if (!sku) { setError('Escribí el SKU (ej. IDB 35).'); return; }
    if (!units || units < 2) { setError('Las unidades por caja tienen que ser 2 o más.'); return; }
    await guardar(sku, units);
    setNuevoSku('');
    setNuevoUnits('');
  };

  // Confirmación que funciona también en web (react-native-web no muestra Alert con botones).
  const confirmarBorrar = (sku: string): Promise<boolean> => {
    const msg = `¿Sacar "${sku}" de la lista de masterbox? Va a volver a venderse por unidad.`;
    if (Platform.OS === 'web') {
      return Promise.resolve(typeof window !== 'undefined' ? window.confirm(msg) : true);
    }
    return new Promise((resolve) => {
      Alert.alert('Quitar masterbox', msg, [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Quitar', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const borrar = async (sku: string) => {
    if (!(await confirmarBorrar(sku))) return;
    setSaving(true);
    setError('');
    try {
      const cuit = await getCuitFromStorage();
      await axios.delete(`${API_URL}/admin/masterbox/${encodeURIComponent(sku)}`, { params: { cuit } });
      await cargar();
      await cargarMasterbox();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo quitar.');
    } finally {
      setSaving(false);
    }
  };

  const setUnitsLocal = (sku: string, txt: string) => {
    const n = txt.replace(/[^0-9]/g, '');
    setItems(prev => prev.map(it => it.sku === sku ? { ...it, units: n === '' ? 0 : parseInt(n, 10) } : it));
  };

  return (
    <Modal visible={visible} transparent animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : s.wrapMobile]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="package" size={18} color="#B45309" />
            <Text style={s.title} numberOfLines={1}>Productos por masterbox (caja)</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color="#6B7280" /></Pressable>
          </View>

          <View style={s.body}>
            <Text style={s.desc}>
              Cargá el <Text style={{ fontWeight: '700' }}>SKU</Text> y cuántas unidades trae la caja.
              Al agregar 1 de estos productos, la app suma esa cantidad de unidades al carrito.
            </Text>

            {!!error && (
              <View style={s.errBanner}>
                <Feather name="alert-triangle" size={14} color="#B91C1C" />
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            {/* Alta rápida */}
            <View style={s.addRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="SKU (ej. IDB 35)"
                placeholderTextColor="#9CA3AF"
                value={nuevoSku}
                onChangeText={setNuevoSku}
                autoCapitalize="characters"
              />
              <TextInput
                style={[s.input, { width: 70, textAlign: 'center' }]}
                placeholder="u."
                placeholderTextColor="#9CA3AF"
                value={nuevoUnits}
                onChangeText={(t) => setNuevoUnits(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
              />
              <Pressable style={s.addBtn} onPress={agregar} disabled={saving}>
                <Feather name="plus" size={18} color="#fff" />
              </Pressable>
            </View>

            {/* Lista */}
            {loading ? (
              <View style={s.loadingRow}><ActivityIndicator color="#B45309" /></View>
            ) : items.length === 0 ? (
              <Text style={s.empty}>Todavía no hay productos por masterbox.</Text>
            ) : (
              <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
                {items.map((it) => (
                  <View key={it.sku} style={s.itemRow}>
                    <Text style={s.itemSku} numberOfLines={1}>{it.sku}</Text>
                    <View style={s.unitsWrap}>
                      <TextInput
                        style={s.unitsInput}
                        value={String(it.units || '')}
                        onChangeText={(t) => setUnitsLocal(it.sku, t)}
                        keyboardType="number-pad"
                      />
                      <Text style={s.unitsLabel}>u./caja</Text>
                    </View>
                    <Pressable
                      style={s.saveBtn}
                      onPress={() => guardar(it.sku, it.units)}
                      disabled={saving || !it.units || it.units < 2}
                    >
                      <Feather name="check" size={16} color="#16A34A" />
                    </Pressable>
                    <Pressable style={s.delBtn} onPress={() => borrar(it.sku)} disabled={saving}>
                      <Feather name="trash-2" size={15} color="#D32F2F" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={s.footer}>
            <Pressable style={s.close} onPress={onClose}><Text style={s.closeText}>Cerrar</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  wrap: { flex: 1 },
  wrapDesktop: { alignItems: 'center', justifyContent: 'center' },
  wrapMobile: { justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFFFFF' },
  cardDesktop: { width: 480, borderRadius: 16, overflow: 'hidden' },
  cardMobile: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', maxHeight: '88%' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },

  body: { paddingHorizontal: 16, paddingVertical: 16 },
  desc: { fontFamily: 'Rubik', fontSize: 13, color: '#4B5563', lineHeight: 19, marginBottom: 14 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#B91C1C', lineHeight: 16 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  input: { height: 42, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 10, paddingHorizontal: 12, fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', backgroundColor: '#FFF' },
  addBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#B45309', alignItems: 'center', justifyContent: 'center' },

  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontFamily: 'Rubik', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },

  list: { maxHeight: 320 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemSku: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  unitsWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unitsInput: { width: 52, height: 38, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, textAlign: 'center', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  unitsLabel: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  saveBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  delBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },

  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  close: { height: 44, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B' },
});

export default MasterboxAdminModal;
