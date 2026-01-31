import React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Card raiz
interface CardProps extends ViewProps {
  children: React.ReactNode;
  gradient?: boolean; // Se true, aplica gradiente de fundo
  shadow?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Card({
  children,
  className = '',
  gradient = false,
  shadow = 'md',
  ...props
}: CardProps) {
  const shadowClasses = {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  };

  // Card com gradiente (replicando gradient-card do web)
  if (gradient) {
    return (
      <View
        className={`rounded-lg overflow-hidden ${shadowClasses[shadow]} ${className}`}
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: shadow === 'xl' ? 8 : 4 },
          shadowOpacity: shadow === 'xl' ? 0.2 : 0.1,
          shadowRadius: shadow === 'xl' ? 16 : 8,
          elevation: shadow === 'xl' ? 12 : 8,
        }}
        {...props}
      >
        <LinearGradient
          colors={['#8b5cf6', '#6d28d9']} // primary-500 to primary-700
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="w-full h-full"
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  // Card padrão
  return (
    <View
      className={`bg-white rounded-lg border border-secondary-200 ${shadowClasses[shadow]} ${className}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: shadow === 'xl' ? 8 : shadow === 'lg' ? 4 : 2 },
        shadowOpacity: shadow === 'xl' ? 0.2 : shadow === 'lg' ? 0.15 : 0.1,
        shadowRadius: shadow === 'xl' ? 16 : shadow === 'lg' ? 8 : 4,
        elevation: shadow === 'xl' ? 12 : shadow === 'lg' ? 8 : 4,
      }}
      {...props}
    >
      {children}
    </View>
  );
}

// Card Header
interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <View className={`px-6 pt-6 pb-2 ${className}`}>
      {children}
    </View>
  );
}

// Card Title
interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <Text className={`text-xl font-semibold text-secondary-900 ${className}`}>
      {children}
    </Text>
  );
}

// Card Description
interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return (
    <Text className={`text-sm text-secondary-500 mt-1 ${className}`}>
      {children}
    </Text>
  );
}

// Card Content
interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <View className={`px-6 py-4 ${className}`}>
      {children}
    </View>
  );
}

// Card Footer
interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <View className={`px-6 pb-6 pt-2 flex-row items-center ${className}`}>
      {children}
    </View>
  );
}
