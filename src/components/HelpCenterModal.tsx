// src/components/HelpCenterModal.tsx
// Centro de ayuda: modal con guías paso a paso para las dudas más comunes de
// los vendedores (cargar un pedido, ver sus pedidos, ver su dashboard,
// favoritos). Un solo componente compartido por mobile y desktop — en desktop
// se centra como card, en mobile sube como bottom-sheet, siguiendo el mismo
// patrón de Modal que ya usa pedidos.tsx.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';
import { navigationRef } from '../../App';
import { useHelpCenterStore } from '../store/helpCenterStore';
import { useTourStore } from '../store/tourStore';

type HelpStep = { text: string };
type HelpTopic = {
  id: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  steps: HelpStep[];
  cta?: { label: string; go: () => void };
  // Solo el tema "cargar un pedido" tiene tour interactivo real (recorre
  // catálogo → carrito → cliente/plazo → confirmar); los demás son guías
  // de un solo paso/pantalla, no ameritan un tour propio.
  hasTour?: boolean;
};

const goTo = (screen: string, params?: any) => {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('MainTabs' as never, params ? ({ screen, params } as never) : ({ screen } as never));
};

// "Pedidos" no vive adentro de MainTabs: es una pantalla de Stack raíz propia
// (la que se abre desde el botón "PEDIDOS" del Dashboard), así que se navega
// directo por su nombre en vez de anidarla bajo MainTabs.
const goToRoot = (screen: string) => {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate(screen as never);
};

const TOPICS: HelpTopic[] = [
  {
    id: 'cargar-pedido',
    title: 'Cómo cargar un pedido',
    icon: 'shopping-cart',
    steps: [
      { text: 'Entrá al Catálogo y buscá el producto que necesitás.' },
      { text: 'Tocá "Agregar al carrito". Podés repetirlo con todos los productos que quieras — el carrito los va acumulando aunque cambies de pantalla.' },
      { text: 'Andá al Carrito (ícono del carrito, arriba o en el menú lateral).' },
      { text: 'Elegí el Cliente para el que es el pedido.' },
      { text: 'Elegí el Plazo de pago.' },
      { text: 'Revisá los productos y tocá "Continuar" para confirmar el pedido.' },
    ],
    cta: { label: 'Ir al catálogo', go: () => goTo('Productos', { screen: 'ProductosList' }) },
    hasTour: true,
  },
  {
    id: 'ver-pedidos',
    title: 'Cómo ver tu historial de pedidos',
    icon: 'file-text',
    steps: [
      { text: 'Entrá a "Perfil" desde el menú.' },
      { text: 'Tocá la opción "Mi Dashboard".' },
      { text: 'Tocá "PEDIDOS" en el dashboard para entrar al historial completo.' },
      { text: 'Ahí aparece la lista de todos tus pedidos, con su estado (pendiente, aprobado, facturado, etc). Usá el buscador o los filtros para encontrar uno puntual.' },
      { text: 'Tocá un pedido de la lista para ver el detalle completo: productos, cantidades, impuestos y totales.' },
    ],
    cta: { label: 'Ir a Pedidos', go: () => goToRoot('Pedidos') },
  },
  {
    id: 'dashboard',
    title: 'Cómo ver tu dashboard de ventas',
    icon: 'bar-chart-2',
    steps: [
      { text: 'Entrá a "Perfil" desde el menú.' },
      { text: 'Tocá la opción "Mi Dashboard".' },
      { text: 'Ahí vas a encontrar un resumen de tu actividad y tus números de venta.' },
    ],
    cta: { label: 'Ir a Perfil', go: () => goTo('Perfil') },
  },
  {
    id: 'favoritos',
    title: 'Cómo guardar productos favoritos',
    icon: 'heart',
    steps: [
      { text: 'Desde el catálogo o el detalle de un producto, tocá el ícono de corazón para marcarlo como favorito.' },
      { text: 'Entrá a "Favoritos" desde el menú para ver todos los productos que marcaste.' },
      { text: 'Te sirve para armar pedidos más rápido con los productos que más pedís.' },
    ],
    cta: { label: 'Ir a Favoritos', go: () => goTo('Favoritos') },
  },
];

// Un solo componente montado una vez (ver AppNavigator.tsx), controlado por
// helpCenterStore para poder abrirlo desde el sidebar (desktop) o el header
// (mobile) sin acoplar esos componentes entre sí.
const HelpCenterModal = () => {
  const isDesktopWeb = useIsDesktopWeb();
  const visible = useHelpCenterStore((s) => s.visible);
  const close = useHelpCenterStore((s) => s.close);
  const [topicId, setTopicId] = useState<string | null>(null);
  const topic = TOPICS.find((t) => t.id === topicId) || null;
  const startTour = useTourStore((s) => s.start);

  const handleClose = () => {
    close();
    setTimeout(() => setTopicId(null), 250);
  };

  const handleStartTour = () => {
    // El tour arranca en el catálogo (su primer paso resalta un producto),
    // así que navegamos ahí antes de activarlo.
    goTo('Productos', { screen: 'ProductosList' });
    startTour();
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktopWeb ? 'fade' : 'slide'}
      onRequestClose={handleClose}
    >
      <Pressable style={s.backdrop} onPress={handleClose} />
      <View style={[s.cardWrap, isDesktopWeb ? s.cardWrapDesktop : s.cardWrapMobile]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            {topic ? (
              <Pressable style={s.backBtn} onPress={() => setTopicId(null)} hitSlop={8}>
                <Feather name="arrow-left" size={20} color="#2B2B2B" />
              </Pressable>
            ) : (
              <Feather name="help-circle" size={20} color="#1C9BD8" style={{ marginRight: 8 }} />
            )}
            <Text style={s.headerTitle} numberOfLines={1}>
              {topic ? topic.title : 'Centro de ayuda'}
            </Text>
            <Pressable style={s.closeBtn} onPress={handleClose} hitSlop={8}>
              <Feather name="x" size={20} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {!topic ? (
              <>
                <Text style={s.subtitle}>Elegí un tema para ver la guía paso a paso.</Text>
                {TOPICS.map((t) => (
                  <Pressable key={t.id} style={s.topicRow} onPress={() => setTopicId(t.id)}>
                    <View style={s.topicIconWrap}>
                      <Feather name={t.icon} size={18} color="#1C9BD8" />
                    </View>
                    <Text style={s.topicLabel}>{t.title}</Text>
                    <Feather name="chevron-right" size={18} color="#C4C4C4" />
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                {topic.steps.map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNumber}>
                      <Text style={s.stepNumberText}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step.text}</Text>
                  </View>
                ))}
                {topic.hasTour && (
                  <Pressable style={s.ctaBtn} onPress={handleStartTour}>
                    <Feather name="play" size={15} color="#FFFFFF" />
                    <Text style={s.ctaBtnText}>Hacer el tour guiado</Text>
                  </Pressable>
                )}
                {topic.cta && (
                  <Pressable
                    style={topic.hasTour ? s.ctaBtnSecondary : s.ctaBtn}
                    onPress={() => {
                      topic.cta!.go();
                      handleClose();
                    }}
                  >
                    <Text style={topic.hasTour ? s.ctaBtnSecondaryText : s.ctaBtnText}>{topic.cta.label}</Text>
                    <Feather name="arrow-right" size={16} color={topic.hasTour ? '#1C9BD8' : '#FFFFFF'} />
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  cardWrap: { flex: 1 },
  cardWrapDesktop: { alignItems: 'center', justifyContent: 'center' },
  cardWrapMobile: { justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFFFFF' },
  cardDesktop: { width: 420, maxHeight: '80%', borderRadius: 16, overflow: 'hidden' },
  cardMobile: { width: '100%', maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  backBtn: { marginRight: 2 },
  headerTitle: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#2B2B2B' },
  closeBtn: { marginLeft: 8 },

  body: { paddingHorizontal: 16, paddingVertical: 14 },
  subtitle: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280', marginBottom: 14 },

  topicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  topicIconWrap: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF6FC',
    alignItems: 'center', justifyContent: 'center',
  },
  topicLabel: { flex: 1, fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', fontWeight: '500' },

  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' },
  stepNumber: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#1C9BD8',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNumberText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'BarlowCondensed-Bold' },
  stepText: { flex: 1, fontFamily: 'Rubik', fontSize: 13.5, color: '#374151', lineHeight: 19 },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1C9BD8', height: 46, borderRadius: 999, marginTop: 6, marginBottom: 10,
  },
  ctaBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 0.5 },
  ctaBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, borderRadius: 999, marginBottom: 10,
  },
  ctaBtnSecondaryText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#1C9BD8', letterSpacing: 0.5 },
});

export default HelpCenterModal;
