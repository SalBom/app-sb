// src/components/CarritoActions.tsx
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  backLabel?: string;
  nextLabel?: string;
}

const CarritoActions: React.FC<Props> = ({
  onBack,
  onNext,
  nextDisabled,
  backLabel = 'VOLVER',
  nextLabel = 'CONTINUAR',
}) => (
  <View style={styles.wrapper}>
    {onBack ? (
      <TouchableOpacity style={styles.back} onPress={onBack}>
        <Text style={styles.backText}>{backLabel}</Text>
      </TouchableOpacity>
    ) : <View />}

    {onNext ? (
      <TouchableOpacity
        style={[styles.next, nextDisabled && { opacity: 0.5 }]}
        onPress={onNext}
        disabled={!!nextDisabled}
      >
        <Text style={styles.nextText}>{nextLabel}</Text>
      </TouchableOpacity>
    ) : <View />}
  </View>
);

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  back: { backgroundColor: '#E5E7EB', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999 },
  backText: { fontWeight: 'bold', color: '#333' },
  next: { backgroundColor: '#1C9BD8', paddingVertical: 12, paddingHorizontal: 26, borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  nextText: { fontWeight: 'bold', color: '#fff', letterSpacing: 1 },
});

export default CarritoActions;
