import React from 'react';
import { View, Image, Text, ViewProps } from 'react-native';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps extends ViewProps {
  src?: string;
  alt?: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({
  src,
  alt = 'Avatar',
  size = 'md',
  className = '',
  ...props
}: AvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const sizePx = {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
  };

  return (
    <View
      className={`${sizeClasses[size]} rounded-full overflow-hidden bg-primary-100 items-center justify-center ${className}`}
      {...props}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: sizePx[size], height: sizePx[size] }}
          accessibilityLabel={alt}
        />
      ) : (
        <AvatarFallback alt={alt} size={size} />
      )}
    </View>
  );
}

// Avatar Fallback - Iniciais do nome
interface AvatarFallbackProps {
  alt: string;
  size: AvatarSize;
}

function AvatarFallback({ alt, size }: AvatarFallbackProps) {
  // Extrai iniciais do nome (primeiras letras de até 2 palavras)
  const getInitials = (name: string) => {
    const words = name.trim().split(' ').filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };

  const initials = getInitials(alt);

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-xl',
  };

  return (
    <Text className={`${textSizeClasses[size]} font-semibold text-primary-600`}>
      {initials}
    </Text>
  );
}

// Avatar com imagem + fallback
interface AvatarImageProps {
  src: string;
  alt: string;
}

export function AvatarImage({ src, alt }: AvatarImageProps) {
  // Este componente é usado internamente, mas pode ser exportado
  // para uso separado se necessário
  return null;
}
