type Factura = {
  amount_total: number;
  invoice_date: string;
  partner_id: number;
};

// src/screens/DashboardVendedor.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useDashboardStore } from '../store/useDashboardStore';
import { getCuitFromStorage } from '../utils/authStorage';
import { useKpiFromFacturas } from '../hooks/useKpiFromFacturas';

type Cliente = {
  id: number;
  name: string;
  vat?: string;
};

const DashboardVendedor = () => {
  const {
    cuit,
    loading,
    error,
    pedidos,
    clasificados,
    facturas,
    fetchDashboardData,
  } = useDashboardStore();

  useEffect(() => {
    console.log("📥 useEffect lanzado para cargar el dashboard");
    const init = async () => {
      const storedCuit = await getCuitFromStorage();
      console.log("🧠 CUIT desde AsyncStorage:", storedCuit);
      if (storedCuit) {
        console.log("🚀 Ejecutando fetchDashboardData con:", storedCuit);
        await fetchDashboardData(storedCuit);
      }
    };
    init();
  }, []);

  const safeClasificados = {
    activos: Array.isArray(clasificados?.activos) ? clasificados.activos : [],
    riesgo_medio: Array.isArray(clasificados?.riesgo_medio) ? clasificados.riesgo_medio : [],
    riesgo_alto: Array.isArray(clasificados?.riesgo_alto) ? clasificados.riesgo_alto : [],
    perdidos: Array.isArray(clasificados?.perdidos) ? clasificados.perdidos : [],
  };

  const allClientes = [
    ...safeClasificados.activos,
    ...safeClasificados.riesgo_medio,
    ...safeClasificados.riesgo_alto,
    ...safeClasificados.perdidos,
  ];

  console.log("📦 Facturas desde store:", facturas);

  const kpiCalc = useKpiFromFacturas(facturas ?? [], allClientes);

  const safePedidos = Array.isArray(pedidos) ? pedidos : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Cargando dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'red' }}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mi cuenta</Text>

      <View style={styles.card}>
        <Text style={styles.section}>📊 Estado de Clientes</Text>
        <Text>Total: {allClientes.length}</Text>
        <Text>🟢 Activos: {safeClasificados.activos.length}</Text>
        <Text>🟡 Riesgo medio: {safeClasificados.riesgo_medio.length}</Text>
        <Text>🟠 Riesgo alto: {safeClasificados.riesgo_alto.length}</Text>
        <Text>🔴 Perdidos: {safeClasificados.perdidos.length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>📈 KPIs del mes</Text>
        <Text>Total pedidos: {safePedidos.length}</Text>
        <Text>Total facturado: USD {kpiCalc.total_facturado_mes.toFixed(2)}</Text>
        <Text>Clientes nuevos: {kpiCalc.clientes_nuevos}</Text>
        <Text>Clientes perdidos: {kpiCalc.clientes_perdidos}</Text>
      </View>

      <Text style={styles.section}>📄 Últimos pedidos</Text>
      {safePedidos.length === 0 ? (
        <Text>No hay pedidos recientes</Text>
      ) : (
        safePedidos.map((p, idx) => (
          <View key={idx} style={styles.card}>
            <Text style={styles.pedidoTitulo}>#{p?.pedido_id ?? '—'}</Text>
            <Text>Cliente: {p?.cliente ?? '—'}</Text>
            <Text>Fecha: {p?.fecha ?? '—'}</Text>
            <Text>Total: USD {p?.total ?? '—'}</Text>
            <Text>Estado: {p?.estado_pago ?? '—'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 80,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  section: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  pedidoTitulo: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
});

export default DashboardVendedor;