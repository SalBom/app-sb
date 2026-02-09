import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image'; 
import Svg, { Path, Defs, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons'; 
import axios from 'axios';

const SCREEN_W = Dimensions.get('window').width;

const PADDING_LEFT = 0;  
const PADDING_RIGHT = 15; 
const CARD_WIDTH = SCREEN_W - (PADDING_LEFT + PADDING_RIGHT);
const CARD_HEIGHT = 138; 
const CUT_SIZE = 30; 
const SHADOW_OFFSET = 5;
const BLUR_RADIUS = 3;
const SVG_PADDING = 12; 

const SEL_H = 30; 
const SEL_W = 160; 
const SEL_POINT = 10; 
const SEL_FLAT_H = 10; 
const SEL_Y1 = (SEL_H - SEL_FLAT_H) / 2; 
const SEL_Y2 = (SEL_H + SEL_FLAT_H) / 2; 

const MODAL_W_PCT = 0.85; 
const MODAL_W = SCREEN_W * MODAL_W_PCT;
const MODAL_CUT = 20;

import { API_URL } from '../config';

// --- LÓGICA DE IMAGEN FIREBASE (IMPORTADA DE LAS OTRAS TARJETAS) ---
function needsAltMedia(u: string | null | undefined) {
  if (!u) return false;
  const lower = u.toLowerCase();
  const isFb = lower.includes('firebasestorage.googleapis.com') || lower.includes('appspot.com');
  const hasAlt = /\balt=media\b/.test(lower);
  return isFb && !hasAlt;
}

function withAltMedia(u?: string | null): string | null {
  if (!u) return null;
  if (!needsAltMedia(u)) return u;
  return u.includes('?') ? `${u}&alt=media` : `${u}?alt=media`;
}

// ⚠️ LISTA ACTUALIZADA
const ALLOWED_IDS = [1, 21, 22, 24, 31];

interface PaymentTerm {
    id: number;
    nombre: string;
}

let cachedTerms: PaymentTerm[] | null = null;

interface Props {
  product_id: number;
  name: string;
  brand: string;
  code: string;
  price: number;
  listPrice?: number;
  quantity: number;
  
  paymentTermId: number; 
  discountPct: number;
  discountRules?: any; 
  
  onPaymentTermChange: (id: number) => void;

  image_1920?: string | null;          
  image_url?: string | null;           
  image_md_url?: string | null;        
  image_thumb_url?: string | null;     
  onAdd: () => void;
  onSubtract: () => void;
  onDelete: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const pickFirst = (...vals: (string | null | undefined)[]) => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return '';
};

const TarjetaProducto: React.FC<Props> = (props) => {
  const {
    name, brand, code, price, listPrice, quantity,
    paymentTermId, discountPct, discountRules, 
    onPaymentTermChange,
    image_1920, image_url, image_md_url, image_thumb_url,
    onAdd, onSubtract, onDelete,
  } = props;

  const [plazos, setPlazos] = useState<PaymentTerm[]>([]);
  const [showTermModal, setShowTermModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [modalHeight, setModalHeight] = useState(300);

  useEffect(() => {
    const filtrar = (data: PaymentTerm[]) => {
        const filtrados = data.filter(t => ALLOWED_IDS.includes(t.id));
        filtrados.sort((a, b) => a.id - b.id);
        setPlazos(filtrados);
    };

    if (cachedTerms) {
        filtrar(cachedTerms);
    } else {
        axios.get(`${API_URL}/plazos-pago`).then(res => {
            if (Array.isArray(res.data)) {
                cachedTerms = res.data;
                filtrar(res.data);
            }
        }).catch(err => console.log('Error plazos:', err));
    }
  }, []);

  const currentTerm = plazos.find(p => p.id === paymentTermId) || plazos[0];

  // --- SELECCIÓN DE IMAGEN CORREGIDA CON ALTMEDIA ---
  const uri = useMemo(() => {
    // Intentamos obtener la URL de Firebase MD o Thumb primero, aplicando la corrección de alt=media
    const fbUrl = withAltMedia(pickFirst(image_md_url, image_thumb_url, image_url));
    if (fbUrl) return fbUrl;

    // Si no hay Firebase, probamos Base64 de Odoo
    if (image_1920 && image_1920.length > 64) {
        return image_1920.startsWith('data:') 
            ? image_1920 
            : `data:image/png;base64,${image_1920}`;
    }
    return '';
  }, [image_md_url, image_thumb_url, image_url, image_1920]);

  // ... (Resto del código de lógica de precios y SVGs igual al anterior)
  
  const currentPrice = Number(price || 0);
  const baseListPrice = Number(listPrice || 0);
  const isOffer = (baseListPrice > 0) && (currentPrice < (baseListPrice - 0.01));

  const finalPrice = (discountPct > 0) 
      ? currentPrice * (1 - discountPct / 100) 
      : currentPrice;

  const strikedPrice = isOffer ? baseListPrice : (discountPct > 0 ? currentPrice : null);
  const finalPriceColor = isOffer ? '#D32F2F' : '#1F2937';

  const filteredModalPlazos = useMemo(() => {
      if (!isOffer || !discountRules) return plazos;
      return plazos.filter(p => {
          const rule = discountRules[p.id];
          return rule?.oferta === true;
      });
  }, [plazos, isOffer, discountRules]);

  const cardPath = `M 0,0 H ${CARD_WIDTH - CUT_SIZE} L ${CARD_WIDTH},${CUT_SIZE} V ${CARD_HEIGHT - CUT_SIZE} L ${CARD_WIDTH - CUT_SIZE},${CARD_HEIGHT} H 0 V 0 Z`;
  const selectorPath = `M 0,0 H ${SEL_W - SEL_POINT} L ${SEL_W},${SEL_Y1} V ${SEL_Y2} L ${SEL_W - SEL_POINT},${SEL_H} H 0 Z`;
  const modalBgPath = `M ${MODAL_CUT},0 H ${MODAL_W - MODAL_CUT} L ${MODAL_W},${MODAL_CUT} V ${modalHeight - MODAL_CUT} L ${MODAL_W - MODAL_CUT},${modalHeight} H ${MODAL_CUT} L 0,${modalHeight - MODAL_CUT} V ${MODAL_CUT} Z`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.svgContainer}>
        <Svg width={CARD_WIDTH + SVG_PADDING * 2} height={CARD_HEIGHT + SHADOW_OFFSET + SVG_PADDING * 2}>
          <Defs><Filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur in="SourceAlpha" stdDeviation={BLUR_RADIUS} /></Filter></Defs>
          <G transform={`translate(${SVG_PADDING}, ${SVG_PADDING})`}>
            <Path d={cardPath} fill="rgba(0,0,0,0.15)" transform={`translate(0, ${SHADOW_OFFSET})`} filter="url(#shadow)" />
            <Path d={cardPath} fill="#FFFFFF" stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}/>
          </G>
        </Svg>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.leftColumn}>
            {!!uri && !imgError ? (
                <Image 
                  source={{ uri }} 
                  style={styles.image} 
                  contentFit="contain" 
                  transition={200} 
                  cachePolicy="memory-disk"
                  onError={() => setImgError(true)} 
                />
            ) : (<View style={styles.placeholderImg}><Text style={{ fontSize: 10, color: '#999' }}>Sin img</Text></View>)}
        </View>

        <View style={styles.rightColumn}>
            <View style={styles.topRow}>
                <TouchableOpacity onPress={() => setShowTermModal(true)} activeOpacity={0.8} style={{ width: SEL_W, height: SEL_H, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={StyleSheet.absoluteFill}><Svg width={SEL_W} height={SEL_H}><Path d={selectorPath} fill="#F3F4F6" stroke="#E5E7EB" strokeWidth={1} /></Svg></View>
                    <View style={styles.selectorContent}>
                        <Text style={styles.selectorText} numberOfLines={1}>{currentTerm ? currentTerm.nombre : 'CARGANDO...'}</Text>
                        <Feather name="chevron-down" size={14} color="#555" />
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={onDelete} hitSlop={15} style={{ marginRight: 15 }}><Feather name="trash-2" size={18} color="#E74C3C" /></TouchableOpacity>
            </View>

            <Text style={styles.codigo}>{code}</Text>
            <Text style={styles.nombre} numberOfLines={2}>{name}</Text>
            <Text style={styles.marca}>{brand}</Text>

            <View style={styles.bottomRow}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    {strikedPrice !== null && (
                        <Text style={styles.precioTachado}>USD {fmt(strikedPrice)}</Text>
                    )}
                    <Text style={[styles.precio, { color: finalPriceColor }, strikedPrice ? { marginLeft: 8 } : {}]}>
                        USD {fmt(finalPrice)}
                    </Text>
                </View>

                <View style={styles.qtyPill}>
                    <TouchableOpacity onPress={onSubtract} style={styles.qtyBtn} hitSlop={5}><Feather name="minus" size={14} color="#FFFFFF" /></TouchableOpacity>
                    <Text style={styles.qtyText}>{quantity}</Text>
                    <TouchableOpacity onPress={onAdd} style={styles.qtyBtn} hitSlop={5}><Feather name="plus" size={14} color="#FFFFFF" /></TouchableOpacity>
                </View>
            </View>
        </View>
      </View>

      <Modal visible={showTermModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowTermModal(false)}>
              <View style={[styles.modalWrapper, { width: MODAL_W }]}>
                  <View style={StyleSheet.absoluteFill}><Svg width="100%" height="100%"><Path d={modalBgPath} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth={3} /></Svg></View>
                  <View style={styles.modalInner} onLayout={(e) => { if(e.nativeEvent.layout.height > 50) setModalHeight(e.nativeEvent.layout.height) }}>
                      <View style={styles.modalHeader}><Feather name="credit-card" size={24} color="#374151" /><Text style={styles.modalNewTitle}>PLAZOS DE PAGO</Text></View>
                      
                      <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                        {filteredModalPlazos.length > 0 ? (
                            filteredModalPlazos.map((term) => {
                                const isSelected = paymentTermId === term.id;
                                return (
                                    <TouchableOpacity key={term.id} style={styles.modalNewItem} onPress={() => { onPaymentTermChange(term.id); setShowTermModal(false); }}>
                                        <View style={[styles.radioButtonOuter, isSelected && styles.radioButtonOuterSelected]}>{isSelected && <View style={styles.radioButtonInner} />}</View>
                                        <Text style={[styles.modalNewItemText, isSelected && styles.modalNewItemTextSelected]}>{term.nombre}</Text>
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <Text style={{textAlign: 'center', color: '#999', marginVertical: 20}}>
                                No hay plazos disponibles para oferta.
                            </Text>
                        )}
                      </ScrollView>

                      <TouchableOpacity style={styles.cancelButton} onPress={() => setShowTermModal(false)}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                  </View>
              </View>
          </Pressable>
      </Modal>
    </View>
  );
};

// ... (Estilos iguales al anterior)

const styles = StyleSheet.create({
  wrapper: { width: CARD_WIDTH, height: CARD_HEIGHT + SVG_PADDING, marginBottom: 8, marginLeft: PADDING_LEFT },
  svgContainer: { position: 'absolute', top: -SVG_PADDING, left: -SVG_PADDING, right: 0, bottom: 0, zIndex: 0 },
  contentContainer: { flex: 1, flexDirection: 'row', paddingTop: 14, paddingLeft: 12, paddingRight: 20, paddingBottom: 12, zIndex: 1 },
  leftColumn: { width: 90, justifyContent: 'center', alignItems: 'center', marginRight: 12, backgroundColor: '#FFFFFF', borderRadius: 8 },
  image: { width: 80, height: 100 },
  placeholderImg: { width: 80, height: 100, alignItems:'center', justifyContent:'center', backgroundColor: '#F9FAFB', borderRadius: 8 },
  rightColumn: { flex: 1, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  selectorContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 12 },
  selectorText: { fontSize: 11, fontFamily: 'BarlowCondensed-Bold', color: '#333', flex: 1, textAlign: 'left', marginRight: 4 },
  codigo: { fontSize: 12, fontFamily: 'BarlowCondensed-Regular', color: '#6B7280', marginTop: 2 },
  nombre: { fontSize: 16, lineHeight: 18, fontFamily: 'BarlowCondensed-Bold', color: '#1F2937', marginBottom: 0 },
  marca: { fontSize: 12, fontFamily: 'BarlowCondensed-Bold', color: '#9CA3AF', textTransform: 'uppercase' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', marginBottom: 10 },
  
  precio: { fontSize: 22, fontFamily: 'BarlowCondensed-Bold' },
  precioTachado: { fontSize: 14, fontFamily: 'BarlowCondensed-Bold', color: '#999', textDecorationLine: 'line-through' },

  qtyPill: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      backgroundColor: '#1C9BD8', 
      borderRadius: 17, 
      height: 32, 
      paddingHorizontal: 4, 
      minWidth: 85, 
      justifyContent: 'space-between', 
      marginRight: 0 
  },
  qtyBtn: { width: 28, height: '100%', alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#FFFFFF', marginHorizontal: 2, marginTop: -2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalWrapper: { justifyContent: 'center' },
  modalInner: { padding: 20, paddingVertical: 25 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalNewTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, marginLeft: 10, color: '#1F2937', letterSpacing: 0.5 },
  modalNewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalNewItemText: { fontSize: 16, fontFamily: 'BarlowCondensed-Regular', color: '#4B5563' },
  modalNewItemTextSelected: { color: '#1F2937', fontFamily: 'BarlowCondensed-Bold' },
  radioButtonOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  radioButtonOuterSelected: { borderColor: '#1C9BD8' },
  radioButtonInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1C9BD8' },
  cancelButton: { marginTop: 15, alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#EF4444', fontFamily: 'BarlowCondensed-Medium', fontSize: 16 }
});

export default React.memo(TarjetaProducto);