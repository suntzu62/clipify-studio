import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  TouchableOpacityProps,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Variantes replicando o design system do web
type ButtonVariant =
  | 'default'      // Roxo primário padrão
  | 'destructive'  // Vermelho para ações destrutivas
  | 'success'      // Verde para ações de sucesso
  | 'warning'      // Amarelo para avisos
  | 'info'         // Azul para informações
  | 'outline'      // Contorno sem preenchimento
  | 'secondary'    // Cinza secundário
  | 'ghost'        // Transparente
  | 'link'         // Estilo de link
  | 'hero'         // Destaque com gradiente
  | 'glow';        // Com efeito glow

type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends TouchableOpacityProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export function Button({
  variant = 'default',
  size = 'md',
  children,
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  icon,
  iconPosition = 'left',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  // Classes base com border radius de 0.75rem (12px)
  const baseClasses = 'flex-row items-center justify-center rounded-lg';

  // Variantes de cor (replicando CVA variants do web)
  const variantClasses = {
    default: 'bg-primary-500 active:bg-primary-600',
    destructive: 'bg-error active:bg-red-600',
    success: 'bg-success active:bg-green-600',
    warning: 'bg-warning active:bg-yellow-600',
    info: 'bg-info active:bg-blue-600',
    outline: 'bg-transparent border-2 border-primary-500 active:bg-primary-50',
    secondary: 'bg-secondary-200 active:bg-secondary-300',
    ghost: 'bg-transparent active:bg-gray-100',
    link: 'bg-transparent',
    hero: '', // Usa gradiente
    glow: 'bg-primary-500 active:bg-primary-600', // + shadow
  };

  // Tamanhos (h-11, h-10, h-9 do web)
  const sizeClasses = {
    sm: 'px-3 py-2',     // h-9
    md: 'px-4 py-2.5',   // h-10
    lg: 'px-8 py-3',     // h-11
    icon: 'p-2',         // Square
  };

  // Classes de texto por variante
  const textVariantClasses = {
    default: 'text-white font-semibold',
    destructive: 'text-white font-semibold',
    success: 'text-white font-semibold',
    warning: 'text-white font-semibold',
    info: 'text-white font-semibold',
    outline: 'text-primary-500 font-semibold',
    secondary: 'text-secondary-900 font-medium',
    ghost: 'text-secondary-900 font-medium',
    link: 'text-primary-500 font-medium underline',
    hero: 'text-white font-bold',
    glow: 'text-white font-semibold',
  };

  // Tamanhos de texto
  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    icon: 'text-base',
  };

  const widthClass = fullWidth ? 'w-full' : '';
  const opacityClass = isDisabled ? 'opacity-50' : '';

  // Gradiente para variantes hero e glow
  const gradientColors = variant === 'hero' || variant === 'glow'
    ? ['#7c3aed', '#a78bfa'] // primary-600 to primary-400
    : null;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'outline' || variant === 'ghost' || variant === 'link'
              ? '#8b5cf6'
              : '#ffffff'
          }
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <View className="mr-2">{icon}</View>
          )}
          {typeof children === 'string' ? (
            <Text
              className={`${textVariantClasses[variant]} ${textSizeClasses[size]}`}
            >
              {children}
            </Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' && (
            <View className="ml-2">{icon}</View>
          )}
        </>
      )}
    </>
  );

  // Botões com gradiente (hero e glow)
  if (gradientColors) {
    return (
      <TouchableOpacity
        disabled={isDisabled}
        {...props}
        style={[
          props.style,
          variant === 'glow' && {
            shadowColor: '#8b5cf6',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className={`${baseClasses} ${sizeClasses[size]} ${widthClass} ${opacityClass} ${className}`}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Botões padrão
  return (
    <TouchableOpacity
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${opacityClass} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {content}
    </TouchableOpacity>
  );
}
