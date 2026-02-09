import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Button } from "react-native";
import { useRoute } from "@react-navigation/native";
import { RouteProp } from "@react-navigation/native";
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../types/navigation';

type FacturaPDFRouteProp = RouteProp<RootStackParamList, "FacturaPDF">;

const FacturaPDF: React.FC = () => {
  const route = useRoute<FacturaPDFRouteProp>();
  const { facturaId } = route.params; // Ahora 'facturaId' está tipado correctamente

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const prepararFactura = async () => {
      try {
        const response = await fetch(`https://app-salbom-production.up.railway.app/factura_pdf?facturaId=${encodeURIComponent(facturaId)}`);
        const data = await response.json();

        if (response.ok) {
          setPdfUrl(data.pdf_url);
        } else {
          setError(data.error || "Error al obtener la factura");
        }
      } catch (err) {
        console.error("❌ Error preparando factura:", err);
        setError("Error al preparar la factura");
      } finally {
        setLoading(false);
      }
    };

    prepararFactura();
  }, [facturaId]);

  const abrirFacturaEnNavegador = async () => {
    if (!pdfUrl) return;

    await WebBrowser.openBrowserAsync(pdfUrl);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Factura: {facturaId}</Text>
      <Button title="Ver Factura" onPress={abrirFacturaEnNavegador} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  text: {
    fontSize: 18,
    marginBottom: 20,
  },
});

export default FacturaPDF;
