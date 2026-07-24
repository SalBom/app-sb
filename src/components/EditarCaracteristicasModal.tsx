// src/components/EditarCaracteristicasModal.tsx
// Editor de características del producto (solo ADMIN). Los atributos y la
// descripción viven en la base externa (product_specs), no en Odoo. Permite
// editar a mano y/o "Completar con IA" leyendo la ficha técnica. Guardar =
// aprobar (recién ahí se publican en el detalle del producto).
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type Attr = { k: string; v: string };
type Producto = { id: number; name?: string; default_code?: string | null };

const EditarCaracteristicasModal = ({
  visible, onClose, producto, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  producto: Producto | null;
  onSaved?: () => void;
}) => {
  const isDesktopWeb = useIsDesktopWeb();
  const [attrs, setAttrs] = useState<Attr[]>([]);
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [esBorradorIA, setEsBorradorIA] = useState(false);

  useEffect(() => {
    if (!visible || !producto) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const cuit = await getCuitFromStorage();
        const res = await axios.get(`${API_URL}/admin/product-specs/${producto.id}`, { params: { cuit } });
        if (!active) return;
        setAttrs(Array.isArray(res.data?.attributes) ? res.data.attributes : []);
        setDescripcion(res.data?.description || '');
        setEsBorradorIA(res.data?.status === 'borrador');
      } catch (e) {
        if (active) { setAttrs([]); setDescripcion(''); setEsBorradorIA(false); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [visible, producto?.id]);

  const setAttr = (i: number, field: 'k' | 'v', val: string) =>
    setAttrs(prev => prev.map((a, idx) => (idx === i ? { ...a, [field]: val } : a)));
  const addAttr = () => setAttrs(prev => [...prev, { k: '', v: '' }]);
  const removeAttr = (i: number) => setAttrs(prev => prev.filter((_, idx) => idx !== i));

  const generarIA = async () => {
    if (!producto) return;
    setGenerating(true);
    try {
      const cuit = await getCuitFromStorage();
      const res = await axios.post(`${API_URL}/admin/product-specs/${producto.id}/generar-ia`, {
        cuit, sku: producto.default_code, name: producto.name,
      });
      setAttrs(Array.isArray(res.data?.attributes) ? res.data.attributes : []);
      setDescripcion(res.data?.description || '');
      setEsBorradorIA(true);
    } catch (e: any) {
      Alert.alert('Completar con IA', e?.response?.data?.error || 'No se pudo generar con IA.');
    } finally {
      setGenerating(false);
    }
  };

  const guardar = async () => {
    if (!producto) return;
    setSaving(true);
    try {
      const cuit = await getCuitFromStorage();
      const limpio = attrs
        .map(a => ({ k: (a.k || '').trim(), v: (a.v || '').trim() }))
        .filter(a => a.k && a.v);
      await axios.put(`${API_URL}/admin/product-specs/${producto.id}`, {
        cuit, sku: producto.default_code, attributes: limpio, description: descripcion.trim(),
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : s.wrapMobile]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="sliders" size={18} color="#1C9BD8" />
            <Text style={s.headerTitle} numberOfLines={1}>Características · {producto?.name || ''}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color="#6B7280" /></Pressable>
          </View>

          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color="#1C9BD8" /></View>
          ) : (
            <ScrollView style={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {esBorradorIA && (
                <View style={s.iaBanner}>
                  <Feather name="cpu" size={14} color="#B45309" />
                  <Text style={s.iaBannerText}>Borrador generado por IA. Revisá y tocá "Guardar" para publicarlo.</Text>
                </View>
              )}

              <Pressable style={[s.iaBtn, generating && { opacity: 0.7 }]} onPress={generarIA} disabled={generating}>
                {generating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="zap" size={15} color="#fff" />
                    <Text style={s.iaBtnText}>Completar con IA (desde la ficha)</Text>
                  </>
                )}
              </Pressable>

              <Text style={s.label}>Atributos</Text>
              {attrs.length === 0 && <Text style={s.empty}>Sin atributos. Agregá o completá con IA.</Text>}
              {attrs.map((a, i) => (
                <View key={i} style={s.attrRow}>
                  <TextInput style={[s.input, s.inputK]} placeholder="Propiedad" value={a.k} onChangeText={t => setAttr(i, 'k', t)} placeholderTextColor="#9CA3AF" />
                  <TextInput style={[s.input, s.inputV]} placeholder="Valor" value={a.v} onChangeText={t => setAttr(i, 'v', t)} placeholderTextColor="#9CA3AF" />
                  <Pressable onPress={() => removeAttr(i)} hitSlop={6} style={s.del}><Feather name="trash-2" size={16} color="#D32F2F" /></Pressable>
                </View>
              ))}
              <Pressable style={s.addBtn} onPress={addAttr}>
                <Feather name="plus" size={15} color="#1C9BD8" />
                <Text style={s.addBtnText}>Agregar atributo</Text>
              </Pressable>

              <Text style={[s.label, { marginTop: 16 }]}>Descripción</Text>
              <TextInput
                style={s.desc}
                multiline
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder="Descripción del producto…"
                placeholderTextColor="#9CA3AF"
              />
              <View style={{ height: 12 }} />
            </ScrollView>
          )}

          <View style={s.footer}>
            <Pressable style={s.cancel} onPress={onClose}><Text style={s.cancelText}>Cancelar</Text></Pressable>
            <Pressable style={[s.save, (saving || loading) && { opacity: 0.6 }]} onPress={guardar} disabled={saving || loading}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Guardar</Text>}
            </Pressable>
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
  cardDesktop: { width: 520, maxHeight: '85%', borderRadius: 16, overflow: 'hidden' },
  cardMobile: { width: '100%', maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerTitle: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },

  body: { paddingHorizontal: 16, paddingVertical: 14 },
  iaBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 10, marginBottom: 12 },
  iaBannerText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E', lineHeight: 16 },
  iaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', height: 44, borderRadius: 10, marginBottom: 16 },
  iaBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 0.3 },

  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#6B7280', letterSpacing: 0.4, marginBottom: 8, textTransform: 'uppercase' },
  empty: { fontFamily: 'Rubik', fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  attrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: { height: 40, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  inputK: { flex: 1 },
  inputV: { flex: 1.2 },
  del: { width: 30, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  addBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#1C9BD8' },
  desc: { minHeight: 90, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', textAlignVertical: 'top', backgroundColor: '#FFFFFF' },

  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  cancel: { flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B' },
  save: { flex: 1.4, height: 44, borderRadius: 999, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 0.5 },
});

export default EditarCaracteristicasModal;
