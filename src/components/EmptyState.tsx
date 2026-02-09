import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  title: string;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
}

export default function EmptyState({ title, message, icon = 'info', style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={32} color="#9CA3AF" />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  message: {
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
});