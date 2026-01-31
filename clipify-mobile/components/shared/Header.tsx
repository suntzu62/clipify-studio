import React from 'react';
import { View, Text, TouchableOpacity, ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { useRouter } from 'expo-router';

interface HeaderProps extends ViewProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showProfile?: boolean;
  showNotifications?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
  user?: {
    name: string;
    avatar?: string;
  };
}

/**
 * Header - Barra de navegação superior replicando o Header.tsx do web
 * Mantém a identidade visual com cores roxas e layout consistente
 */
export function Header({
  title,
  subtitle,
  showBack = false,
  showProfile = false,
  showNotifications = false,
  onBackPress,
  rightAction,
  className = '',
  user,
  ...props
}: HeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View
      className={`bg-white border-b border-secondary-200 px-4 py-3 ${className}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
      {...props}
    >
      <View className="flex-row items-center justify-between">
        {/* Left side */}
        <View className="flex-row items-center flex-1">
          {showBack && (
            <TouchableOpacity
              onPress={handleBack}
              className="mr-3 p-2 active:bg-secondary-100 rounded-lg"
            >
              <Ionicons name="arrow-back" size={24} color="#0f172a" />
            </TouchableOpacity>
          )}

          {title && (
            <View className="flex-1">
              <Text className="text-xl font-bold text-secondary-900">
                {title}
              </Text>
              {subtitle && (
                <Text className="text-sm text-secondary-500 mt-0.5">
                  {subtitle}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Right side */}
        <View className="flex-row items-center gap-2">
          {showNotifications && (
            <TouchableOpacity
              className="p-2 active:bg-secondary-100 rounded-lg relative"
              onPress={() => {/* TODO: Navigate to notifications */}}
            >
              <Ionicons name="notifications-outline" size={24} color="#0f172a" />
              {/* Badge de notificações não lidas */}
              <View className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
            </TouchableOpacity>
          )}

          {rightAction}

          {showProfile && user && (
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              className="ml-2"
            >
              <Avatar
                src={user.avatar}
                alt={user.name}
                size="md"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
