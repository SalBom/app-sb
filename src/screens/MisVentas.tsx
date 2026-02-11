import React, { useEffect, useState } from "react";
import {View,Text,StyleSheet,ActivityIndicator,FlatList,TextInput,Button,} from "react-native";
import axios from "axios";
import { getCuitFromStorage } from "../utils/authStorage";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

// 🔹 Definir la estructura de las rutas
type RootStackParamList = {
  FacturaPDF: { facturaId: string };
  MisVentas: undefined;
};

// 🔹 Tipar correctamente el Hook de navegación
type NavigationProp = NativeStackNavigationProp<RootStackParamList, "MisVentas">;

interface Venta {
  numero_factura: string;
  cliente: string;
  fecha: string;
  total: number;
  estado_pago: string;
}

const MisVentas: React.FC = () => {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [filteredVentas, setFilteredVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [anioFiltro, setAnioFiltro] = useState<string | null>(null);

  const navigation = useNavigation<NavigationProp>(); // ✅ Hook de navegación tipado correctamente

  useEffect(() => {
    const fetchVentas = async () => {
      try {
        const cuit = await getCuitFromStorage();
        if (!cuit) {
          setError("No se encontró el CUIT.");
          setLoading(false);
          return;
        }

        console.log(`📡 Intentando conectar con: https://app-salbom-production.up.railway.app/mis_ventas?cuit=${cuit}`);

        const response = await axios.get<{ ventas: Venta[] }>(
          `https://app-salbom-production.up.railway.app/mis_ventas?cuit=${cuit}`
        );

        /* console.log("📥 Respuesta del servidor:", response.data); */

        if (response.data.ventas && response.data.ventas.length > 0) {
          setVentas(response.data.ventas);
          setFilteredVentas(response.data.ventas); // Cargamos los datos iniciales
        } else {
          setError("No hay ventas registradas.");
        }
      } catch (err) {
        console.error("🚨 Error en fetchVentas:", err);
        setError("Error al conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    };

    fetchVentas();
  }, []);

  const aplicarFiltros = () => {
    let ventasFiltradas = ventas;

    // Filtrar por cliente
    if (clienteFiltro.trim() !== "") {
      ventasFiltradas = ventasFiltradas.filter((venta) =>
        venta.cliente.toLowerCase().includes(clienteFiltro.toLowerCase())
      );
    }

    // Filtrar por mes y año
    if (mesFiltro && anioFiltro) {
      ventasFiltradas = ventasFiltradas.filter((venta) => {
        const [año, mes] = venta.fecha.split("-"); // Suponiendo formato "YYYY-MM-DD"
        return mes === mesFiltro && año === anioFiltro;
      });
    }

    setFilteredVentas(ventasFiltradas);
  };

  // 📌 Función para abrir el PDF de la factura
  const verFacturaPDF = (facturaId: string) => {
    navigation.navigate("FacturaPDF", { facturaId }); // ✅ Ahora `navigation` está tipado correctamente
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📄 Historial de Ventas</Text>

      {/* Filtro por Cliente */}
      <TextInput
        style={styles.input}
        placeholder="Buscar por Cliente..."
        value={clienteFiltro}
        onChangeText={setClienteFiltro}
      />

      {/* Filtro por Fecha */}
      <View style={styles.filtroContainer}>
        <Picker
          selectedValue={mesFiltro}
          onValueChange={(itemValue) => setMesFiltro(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Mes" value={null} />
          <Picker.Item label="Enero" value="01" />
          <Picker.Item label="Febrero" value="02" />
          <Picker.Item label="Marzo" value="03" />
          <Picker.Item label="Abril" value="04" />
          <Picker.Item label="Mayo" value="05" />
          <Picker.Item label="Junio" value="06" />
          <Picker.Item label="Julio" value="07" />
          <Picker.Item label="Agosto" value="08" />
          <Picker.Item label="Septiembre" value="09" />
          <Picker.Item label="Octubre" value="10" />
          <Picker.Item label="Noviembre" value="11" />
          <Picker.Item label="Diciembre" value="12" />
        </Picker>

        <Picker
          selectedValue={anioFiltro}
          onValueChange={(itemValue) => setAnioFiltro(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Año" value={null} />
          <Picker.Item label="2023" value="2023" />
          <Picker.Item label="2024" value="2024" />
          <Picker.Item label="2025" value="2025" />
        </Picker>
      </View>

      {/* Botón para Aplicar Filtros */}
      <Button title="APLICAR" onPress={aplicarFiltros} />

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filteredVentas}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.ventaItem}>
              <Text style={styles.facturaText}>🧾 Factura: {item.numero_factura}</Text>
              <Text style={styles.infoText}>👤 Cliente: {item.cliente}</Text>
              <Text style={styles.infoText}>📅 Fecha: {item.fecha}</Text>
              <Text style={styles.infoText}>💰 Total: ${item.total.toFixed(2)}</Text>
              <Text style={styles.pagoText}>💳 Estado Pago: {item.estado_pago}</Text>

              {/* Botón para ver el PDF */}
              <Button title="Ver PDF" onPress={() => verFacturaPDF(item.numero_factura)} />
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  filtroContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  picker: {
    flex: 1,
    height: 40,
    marginHorizontal: 5,
  },
  ventaItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 5,
  },
  infoText: {
    fontSize: 16,
  },
  facturaText: {
    fontSize: 17,
    fontWeight: "bold",
  },
  pagoText: {
    fontSize: 16,
    color: "green",
  },
  error: {
    color: "red",
    fontSize: 16,
    textAlign: "center",
  },
});

export default MisVentas;
