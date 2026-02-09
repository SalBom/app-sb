import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { getCuitFromStorage } from '../utils/authStorage';
import { getFacturasPorCuit } from '../services/odooService';

const EstadoCuenta: React.FC = () => {
  const [facturas, setFacturas] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadCuitAndFetchFacturas = async () => {
      setLoading(true);
      setError('');

      try {
        const cuit = await getCuitFromStorage();
        console.log("🔍 CUIT recuperado:", cuit);

        if (!cuit) {
          setError("No se encontró el CUIT. Por favor, inicia sesión nuevamente.");
          setLoading(false);
          return;
        }

        const facturasResponse = await getFacturasPorCuit(cuit);
        console.log("🔵 Facturas obtenidas:", facturasResponse);

        if (facturasResponse.length === 0) {
          setError("No hay facturas registradas.");
        } else {
          setFacturas(facturasResponse);
        }
      } catch (err) {
        console.error("❌ Error al obtener facturas:", err);
        setError("No se pudieron obtener las facturas.");
      } finally {
        setLoading(false);
      }
    };

    loadCuitAndFetchFacturas();
  }, []);

  const renderFactura = ({ item }: { item: any }) => (
    <View style={styles.row}>
      <Text style={styles.cell}>{item.name}</Text>
      <Text style={styles.cell}>{item.invoice_date}</Text>
      <Text style={styles.cell}>${item.amount_total}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Estado de Cuenta</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#007bff" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={styles.headerCell}>Número</Text>
            <Text style={styles.headerCell}>Fecha</Text>
            <Text style={styles.headerCell}>Total</Text>
          </View>

          <FlatList
            data={facturas}
            renderItem={renderFactura}
            keyExtractor={(item) => item.id.toString()}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f1f1',
    padding: 8,
  },
  headerCell: {
    flex: 1,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  cell: {
    flex: 1,
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default EstadoCuenta;
