import React from 'react';
import { SafeAreaView, ViewProps } from 'react-native';

interface SafeAreaProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function SafeArea({ children, className = '', ...props }: SafeAreaProps) {
  return (
    <SafeAreaView className={`flex-1 bg-secondary-50 ${className}`} {...props}>
      {children}
    </SafeAreaView>
  );
}
