import React, { useState, useCallback } from 'react';
import { ScrollView, RefreshControl, ViewStyle, StyleProp } from 'react-native';

interface Props {
  children: React.ReactNode;
  onRecargar?: () => Promise<void> | void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const LayoutRefresh: React.FC<Props> = ({ 
  children, 
  onRecargar, 
  style, 
  contentContainerStyle 
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRecargar) return;
    setRefreshing(true);
    try {
      await onRecargar();
    } catch (e) {
      console.log(e);
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  }, [onRecargar]);

  return (
    <ScrollView
      style={[{ flex: 1 }, style]} // <--- IMPORTANTE: flex: 1 para ocupar el espacio sobrante
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRecargar ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#1C9BD8']}
            tintColor="#1C9BD8"
            // En Android, esto baja un poco el spinner para que no quede pegado al borde
            progressViewOffset={10} 
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
};

export default LayoutRefresh;