import React from 'react';
import { View, Text, ViewProps } from 'react-native';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline';

interface BadgeProps extends ViewProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  className = '',
  ...props
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-primary-100 border-primary-200',
    secondary: 'bg-secondary-100 border-secondary-200',
    success: 'bg-green-100 border-green-200',
    warning: 'bg-yellow-100 border-yellow-200',
    error: 'bg-red-100 border-red-200',
    info: 'bg-blue-100 border-blue-200',
    outline: 'bg-transparent border-secondary-300',
  };

  const textVariantClasses = {
    default: 'text-primary-700',
    secondary: 'text-secondary-700',
    success: 'text-green-700',
    warning: 'text-yellow-700',
    error: 'text-red-700',
    info: 'text-blue-700',
    outline: 'text-secondary-700',
  };

  return (
    <View
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      <Text className={`text-xs font-semibold ${textVariantClasses[variant]}`}>
        {children}
      </Text>
    </View>
  );
}
