import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  status?: 'red' | 'orange' | 'green' | string;
  size?: number;
  style?: any;
}

const StockSemaphore: React.FC<Props> = ({ status = 'green', size = 12, style }) => {
  let color = '#2ECC71'; // Verde default

  if (status === 'red') color = '#E74C3C';
  else if (status === 'orange') color = '#F39C12';
  else if (status === 'green') color = '#2ECC71';

  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)', // Sutil borde para contraste en fondos blancos
  },
});

export default StockSemaphore;