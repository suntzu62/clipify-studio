import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores';

export default function LandingScreen() {
  const router = useRouter();
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const isAuth = await checkAuth();
        if (isAuth) {
          // Usuário autenticado - ir para home
          router.replace('/(tabs)/home');
        } else {
          // Usuário não autenticado - mostrar landing
          setIsChecking(false);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setIsChecking(false);
      }
    };

    verifyAuth();
  }, []);

  // Mostrar loading enquanto verifica autenticação
  if (isChecking || isLoading) {
    return (
      <View className="flex-1">
        <LinearGradient
          colors={['#8b5cf6', '#6d28d9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          className="flex-1 justify-center items-center"
        >
          <View className="bg-white/10 p-6 rounded-full mb-6">
            <Ionicons name="videocam" size={64} color="#fff" />
          </View>
          <Text className="text-white text-5xl font-bold mb-4">Clipify</Text>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text className="text-white/80 mt-4">Carregando...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#8b5cf6', '#6d28d9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        className="flex-1 justify-center items-center px-6"
      >
        {/* Logo e Título */}
        <View className="items-center mb-12">
          <View className="bg-white/10 p-6 rounded-full mb-6">
            <Ionicons name="videocam" size={64} color="#fff" />
          </View>
          <Text className="text-white text-5xl font-bold mb-3">Clipify</Text>
          <Text className="text-white/90 text-lg text-center">
            Transforme seus vídeos em conteúdo viral
          </Text>
        </View>

        {/* Botões de ação */}
        <View className="w-full gap-4">
          <Button
            variant="default"
            size="lg"
            fullWidth
            className="bg-white"
            onPress={() => router.push('/(auth)/login')}
          >
            <Text className="text-primary-500 text-center font-semibold text-lg">
              Entrar
            </Text>
          </Button>

          <Button
            variant="outline"
            size="lg"
            fullWidth
            className="border-2 border-white"
            onPress={() => router.push('/(auth)/register')}
          >
            <Text className="text-white text-center font-semibold text-lg">
              Criar conta gratuita
            </Text>
          </Button>
        </View>

        {/* Features */}
        <View className="mt-12 gap-3">
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text className="text-white/90 text-sm ml-2">
              Cortes automáticos com IA
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text className="text-white/90 text-sm ml-2">
              Legendas geradas automaticamente
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text className="text-white/90 text-sm ml-2">
              Análise de viralidade
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
