import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/shared';
import { Button, Card, CardContent } from '@/components/ui';
import { useCreateJob } from '@/hooks/useJobs';
import { useAuthStore } from '@/stores';
import apiClient from '@/services/api';

export default function ConfigureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storagePath: string;
    fileName: string;
    videoUri: string;
    duration: string;
  }>();

  const { user } = useAuthStore();
  const createJobMutation = useCreateJob();

  // Configurações do clipe
  const [targetDuration, setTargetDuration] = useState(60); // segundos
  const [clipCount, setClipCount] = useState(5);

  const durationOptions = [
    { value: 30, label: '30s', description: 'TikTok/Reels curto' },
    { value: 60, label: '60s', description: 'TikTok/Reels padrão' },
    { value: 90, label: '90s', description: 'YouTube Shorts' },
  ];

  const clipCountOptions = [3, 5, 10];

  const handleStartProcessing = async () => {
    if (!user?.id || !params.storagePath || !params.fileName) {
      Alert.alert('Erro', 'Dados incompletos para processar o vídeo');
      return;
    }

    try {
      const response = await apiClient.createJobFromUpload(
        user.id,
        params.storagePath,
        params.fileName,
        targetDuration,
        clipCount
      );

      // Navegar para tela de processamento
      router.replace({
        pathname: '/processing/[id]',
        params: { id: response.jobId },
      });
    } catch (error: any) {
      Alert.alert(
        'Erro',
        error.response?.data?.message || 'Não foi possível iniciar o processamento'
      );
    }
  };

  return (
    <Screen scrollable className="bg-secondary-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-secondary-200">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4"
          >
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-secondary-900">
              Configurar Clipes
            </Text>
            <Text className="text-secondary-600 text-sm">
              Ajuste as configurações de geração
            </Text>
          </View>
        </View>
      </View>

      {/* Video Preview */}
      {params.videoUri && (
        <View className="px-6 py-4">
          <Card shadow="md">
            <CardContent className="p-0">
              <View className="bg-secondary-900 rounded-t-lg aspect-video items-center justify-center">
                <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.8)" />
              </View>
              <View className="p-4">
                <Text className="text-secondary-900 font-medium" numberOfLines={1}>
                  {params.fileName || 'Vídeo selecionado'}
                </Text>
                <Text className="text-secondary-500 text-sm mt-1">
                  Pronto para processar
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>
      )}

      {/* Duração dos Clipes */}
      <View className="px-6 py-4">
        <Text className="text-lg font-bold text-secondary-900 mb-2">
          Duração dos Clipes
        </Text>
        <Text className="text-secondary-600 text-sm mb-4">
          Escolha a duração ideal para cada clip
        </Text>

        <View className="flex-row gap-3">
          {durationOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => setTargetDuration(option.value)}
              className="flex-1"
            >
              <Card
                shadow={targetDuration === option.value ? 'md' : 'sm'}
                className={targetDuration === option.value ? 'border-2 border-primary-500' : ''}
              >
                <CardContent className="py-4 items-center">
                  {targetDuration === option.value && (
                    <View className="absolute top-2 right-2">
                      <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
                    </View>
                  )}
                  <Text
                    className={`text-2xl font-bold ${
                      targetDuration === option.value ? 'text-primary-500' : 'text-secondary-900'
                    }`}
                  >
                    {option.label}
                  </Text>
                  <Text className="text-secondary-500 text-xs text-center mt-1">
                    {option.description}
                  </Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quantidade de Clipes */}
      <View className="px-6 py-4">
        <Text className="text-lg font-bold text-secondary-900 mb-2">
          Quantidade de Clipes
        </Text>
        <Text className="text-secondary-600 text-sm mb-4">
          Quantos clipes você quer gerar?
        </Text>

        <View className="flex-row gap-3">
          {clipCountOptions.map((count) => (
            <TouchableOpacity
              key={count}
              onPress={() => setClipCount(count)}
              className="flex-1"
            >
              <Card
                shadow={clipCount === count ? 'md' : 'sm'}
                className={clipCount === count ? 'border-2 border-primary-500' : ''}
              >
                <CardContent className="py-6 items-center">
                  {clipCount === count && (
                    <View className="absolute top-2 right-2">
                      <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
                    </View>
                  )}
                  <Text
                    className={`text-3xl font-bold ${
                      clipCount === count ? 'text-primary-500' : 'text-secondary-900'
                    }`}
                  >
                    {count}
                  </Text>
                  <Text className="text-secondary-500 text-sm mt-1">
                    {count === 1 ? 'clip' : 'clipes'}
                  </Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Resumo */}
      <View className="px-6 py-4">
        <Card shadow="md">
          <CardContent>
            <Text className="text-lg font-bold text-secondary-900 mb-3">
              Resumo
            </Text>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-secondary-600">Duração por clip</Text>
                <Text className="text-secondary-900 font-medium">{targetDuration}s</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-secondary-600">Quantidade de clipes</Text>
                <Text className="text-secondary-900 font-medium">{clipCount}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-secondary-600">Conteúdo total estimado</Text>
                <Text className="text-secondary-900 font-medium">
                  ~{Math.round((targetDuration * clipCount) / 60)}min
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Features inclusos */}
      <View className="px-6 py-4">
        <Text className="text-secondary-600 text-sm mb-3">Incluído no processamento:</Text>
        <View className="gap-2">
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text className="text-secondary-700 ml-2">Transcrição automática</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text className="text-secondary-700 ml-2">Detecção de momentos virais</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text className="text-secondary-700 ml-2">Reframe inteligente 9:16</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text className="text-secondary-700 ml-2">Score de viralidade</Text>
          </View>
        </View>
      </View>

      {/* Botão de ação */}
      <View className="px-6 py-6">
        <TouchableOpacity onPress={handleStartProcessing}>
          <LinearGradient
            colors={['#8b5cf6', '#6d28d9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="py-4 rounded-lg flex-row items-center justify-center"
            style={{
              shadowColor: '#8b5cf6',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Ionicons name="rocket" size={24} color="#fff" />
            <Text className="text-white font-bold text-lg ml-2">
              Iniciar Processamento
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text className="text-secondary-500 text-xs text-center mt-4">
          O processamento pode levar alguns minutos dependendo do tamanho do vídeo
        </Text>
      </View>
    </Screen>
  );
}
