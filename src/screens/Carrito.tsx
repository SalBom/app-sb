import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet
} from 'react-native';
import PasoProductos from './PasosCarrito/PasoProductos';
import PasoDatos from './PasosCarrito/PasoDatos';
import PasoConfirmacion from './PasosCarrito/PasoConfirmacion';

const Carrito = () => {
  const [step, setStep] = useState(1);

  const avanzarPaso = () => setStep(prev => Math.min(prev + 1, 3));
  const retrocederPaso = () => setStep(prev => Math.max(prev - 1, 1));

  return (
    <View style={styles.container}>
      {step === 1 && <PasoProductos onNext={avanzarPaso} />}
      {step === 2 && <PasoDatos onNext={avanzarPaso} onBack={retrocederPaso} />}
      {step === 3 && <PasoConfirmacion onBack={retrocederPaso} />}

      <Text style={styles.paso}>Paso {step} de 3</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0, // eliminado el padding top que generaba el espacio
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  paso: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    color: '#666',
  },
});

export default Carrito;