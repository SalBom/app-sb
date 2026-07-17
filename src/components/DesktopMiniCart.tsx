// src/components/DesktopMiniCart.tsx
// Mini-carrito persistente de la versión desktop: se ve siempre mientras se
// navega el catálogo o el detalle de producto (no solo al entrar al carrito),
// para que sea evidente que hay que elegir cliente/plazo ahí y no se pierda
// de vista qué se fue agregando. Es un componente compartido (no vive adentro
// de una sola pantalla) para que el catálogo y el detalle de producto tengan
// el mismo comportamiento y la misma posición — así el vendedor no tiene que
// reaprender nada al pasar de una pantalla a otra.
import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useCartStore } from '../store/cartStore';
import { navigationRef } from '../../App';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, n || 0));

const DesktopMiniCart: React.FC = () => {
  const itemsInCart = useCartStore((s) => s.items);
  const clienteSeleccionado = useCartStore((s) => s.clienteSeleccionado);
  const plazoSeleccionado = useCartStore((s) => s.plazoSeleccionado);
  const removeFromCart = useCartStore((s) => s.removeFromCart);

  // Productos.tsx y ProductoDetalle.tsx viven en navegadores anidados distintos
  // dentro de MainTabs (uno directo, el otro dentro del Stack de la tab
  // Productos), así que un simple navigation.navigate('Carrito') no siempre
  // alcanza — usamos el mismo navigationRef global que ya usa el sidebar de
  // escritorio para llegar ahí desde cualquier punto de la app.
  const goToCarrito = useCallback(() => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('MainTabs' as never, { screen: 'Carrito' } as never);
  }, []);

  const subtotal = useMemo(
    () => itemsInCart.reduce((acc, it) => acc + (Number(it.price_unit) || 0) * (it.product_uom_qty || 1), 0),
    [itemsInCart]
  );
  const needsSetup = itemsInCart.length > 0 && (!clienteSeleccionado || !plazoSeleccionado);

  return (
    <View style={s.miniCart}>
      <View style={s.headerRow}>
        <Feather name="shopping-cart" size={16} color="#2B2B2B" />
        <Text style={s.headerText}>TU PEDIDO {itemsInCart.length > 0 ? `(${itemsInCart.length})` : ''}</Text>
      </View>

      {itemsInCart.length === 0 ? (
        <View style={s.empty}>
          <Feather name="shopping-bag" size={28} color="#D9D9D9" />
          <Text style={s.emptyText}>Agregá productos del catálogo para armar tu pedido</Text>
        </View>
      ) : (
        <>
          {needsSetup && (
            <Pressable style={s.alert} onPress={goToCarrito}>
              <Feather name="alert-circle" size={16} color="#B45309" />
              <Text style={s.alertText}>Elegí cliente y plazo de pago para continuar</Text>
            </Pressable>
          )}

          {!needsSetup && (
            <View style={s.summaryBox}>
              <Text style={s.summaryLine} numberOfLines={1}>👤 {clienteSeleccionado?.name}</Text>
              <Text style={s.summaryLine} numberOfLines={1}>💳 {plazoSeleccionado?.nombre || 'Plazo seleccionado'}</Text>
            </View>
          )}

          <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
            {itemsInCart.map((it) => (
              <View key={it.product_id} style={s.item}>
                <View style={s.itemImgWrap}>
                  {it.image_thumb_url ? (
                    <Image source={{ uri: it.image_thumb_url }} style={s.itemImg} contentFit="contain" />
                  ) : (
                    <Feather name="package" size={16} color="#C4C4C4" />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemName} numberOfLines={2}>{it.name}</Text>
                  <Text style={s.itemMeta}>x{it.product_uom_qty} · USD {fmt(it.price_unit)}</Text>
                </View>
                <Pressable onPress={() => removeFromCart(it.product_id)} hitSlop={8}>
                  <Feather name="x" size={15} color="#B3B3B3" />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <View style={s.footer}>
            <View style={s.subtotalRow}>
              <Text style={s.subtotalLabel}>Subtotal estimado</Text>
              <Text style={s.subtotalValue}>USD {fmt(subtotal)}</Text>
            </View>
            <Pressable style={s.cta} onPress={goToCarrito}>
              <Text style={s.ctaText}>IR AL CARRITO</Text>
              <Feather name="arrow-right" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  miniCart: {
    width: 300,
    alignSelf: 'flex-start',
    marginTop: 30,
    marginRight: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 16,
    // Pegado arriba y "sticky" mientras se scrollea la pantalla, igual que un
    // carrito lateral de e-commerce: siempre a la vista sin tapar el contenido.
    position: 'sticky' as any,
    top: 20,
    maxHeight: 'calc(100vh - 40px)' as any,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  headerText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B', letterSpacing: 0.3 },

  empty: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  emptyText: { fontFamily: 'Rubik', fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },

  alert: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10,
    padding: 10, marginBottom: 14,
  },
  alertText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E', lineHeight: 16, fontWeight: '600' },

  summaryBox: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 14, gap: 3 },
  summaryLine: { fontFamily: 'Rubik', fontSize: 12, color: '#374151' },

  list: { maxHeight: 320 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemImgWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
  itemImg: { width: 30, height: 30 },
  itemName: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 12.5, color: '#2B2B2B', lineHeight: 15 },
  itemMeta: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  footer: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  subtotalLabel: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280' },
  subtotalValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1C9BD8', height: 44, borderRadius: 999,
  },
  ctaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 0.5 },
});

export default DesktopMiniCart;
