import React from 'react';
import { View, ScrollView, ViewProps, RefreshControl } from 'react-native';
import { SafeArea } from './SafeArea';

interface ScreenProps extends ViewProps {
  children: React.ReactNode;
  scrollable?: boolean;
  safeArea?: boolean;
  className?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Componente Screen - Container padrão para todas as telas
 * Mantém consistência visual e comportamento em toda a aplicação
 */
export function Screen({
  children,
  scrollable = false,
  safeArea = true,
  className = '',
  onRefresh,
  refreshing = false,
  ...props
}: ScreenProps) {
  const content = scrollable ? (
    <ScrollView
      className={`flex-1 ${className}`}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8b5cf6" // primary-500
            colors={['#8b5cf6']} // Android
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${className}`} {...props}>
      {children}
    </View>
  );

  if (safeArea) {
    return <SafeArea>{content}</SafeArea>;
  }

  return content;
}
