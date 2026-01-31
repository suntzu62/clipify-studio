import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/shared';
import { Button, Card, CardContent } from '@/components/ui';
import { useJob } from '@/hooks/useJobs';

const STEPS = [
  { key: 'ingest', label: 'Preparando vídeo', icon: 'cloud-download-outline' },
  { key: 'transcribe', label: 'Transcrevendo áudio', icon: 'mic-outline' },
  { key: 'scenes', label: 'Detectando cenas', icon: 'film-outline' },
  { key: 'rank', label: 'Analisando momentos', icon: 'analytics-outline' },
  { key: 'render', label: 'Renderizando clipes', icon: 'videocam-outline' },
  { key: 'texts', label: 'Gerando legendas', icon: 'text-outline' },
  { key: 'export', label: 'Exportando', icon: 'download-outline' },
];

export default function ProcessingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error } = useJob(id || '');

  // Animação do spinner
  const [spinValue] = useState(new Animated.Value(0));

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const spinAnimation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Navegar quando completar
  useEffect(() => {
    if (job?.status === 'completed') {
      // Aguardar um pouco antes de navegar
      const timer = setTimeout(() => {
        router.replace({
          pathname: '/projects/[id]',
          params: { id: job.id },
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [job?.status]);

  const getCurrentStepIndex = () => {
    if (!job?.currentStep) return 0;
    const index = STEPS.findIndex((s) => s.key === job.currentStep);
    return index >= 0 ? index : 0;
  };

  const getProgress = () => {
    if (typeof job?.progress === 'number') return job.progress;
    if (typeof job?.progress === 'object' && job.progress?.progress) {
      return job.progress.progress;
    }
    return 0;
  };

  const getStatusMessage = () => {
    if (typeof job?.progress === 'object' && job.progress?.message) {
      return job.progress.message;
    }
    const currentStep = STEPS.find((s) => s.key === job?.currentStep);
    return currentStep?.label || 'Processando...';
  };

  if (error) {
    return (
      <Screen className="bg-secondary-50">
        <View className="flex-1 justify-center items-center px-6">
          <View className="bg-red-100 p-6 rounded-full mb-4">
            <Ionicons name="alert-circle" size={64} color="#ef4444" />
          </View>
          <Text className="text-xl font-bold text-secondary-900 mb-2">
            Erro no processamento
          </Text>
          <Text className="text-secondary-600 text-center mb-6">
            {job?.error || 'Ocorreu um erro ao processar seu vídeo'}
          </Text>
          <Button variant="hero" onPress={() => router.replace('/(tabs)/home')}>
            Voltar para Home
          </Button>
        </View>
      </Screen>
    );
  }

  if (job?.status === 'failed') {
    return (
      <Screen className="bg-secondary-50">
        <View className="flex-1 justify-center items-center px-6">
          <View className="bg-red-100 p-6 rounded-full mb-4">
            <Ionicons name="close-circle" size={64} color="#ef4444" />
          </View>
          <Text className="text-xl font-bold text-secondary-900 mb-2">
            Processamento falhou
          </Text>
          <Text className="text-secondary-600 text-center mb-6">
            {job?.error || 'Não foi possível processar seu vídeo. Tente novamente.'}
          </Text>
          <View className="gap-3 w-full">
            <Button variant="hero" fullWidth onPress={() => router.replace('/(tabs)/create')}>
              Tentar Novamente
            </Button>
            <Button variant="outline" fullWidth onPress={() => router.replace('/(tabs)/home')}>
              Voltar para Home
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  if (job?.status === 'completed') {
    return (
      <Screen className="bg-secondary-50">
        <View className="flex-1 justify-center items-center px-6">
          <View className="bg-green-100 p-6 rounded-full mb-4">
            <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
          </View>
          <Text className="text-2xl font-bold text-secondary-900 mb-2">
            Pronto!
          </Text>
          <Text className="text-secondary-600 text-center mb-2">
            Seus clipes foram gerados com sucesso
          </Text>
          <Text className="text-primary-500 font-medium">
            {job.result?.clips?.length || 0} clipes criados
          </Text>
        </View>
      </Screen>
    );
  }

  const currentStepIndex = getCurrentStepIndex();
  const progress = getProgress();

  return (
    <Screen className="bg-secondary-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-secondary-200">
        <Text className="text-xl font-bold text-secondary-900">
          Processando Vídeo
        </Text>
        <Text className="text-secondary-600 text-sm">
          Aguarde enquanto geramos seus clipes
        </Text>
      </View>

      <View className="flex-1 justify-center px-6">
        {/* Spinner animado */}
        <View className="items-center mb-8">
          <View className="relative">
            <Animated.View style={{ transform: [{ rotate: spinAnimation }] }}>
              <LinearGradient
                colors={['#8b5cf6', '#6d28d9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  padding: 4,
                }}
              >
                <View className="flex-1 bg-white rounded-full items-center justify-center">
                  <Text className="text-3xl font-bold text-primary-500">
                    {progress}%
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>

          <Text className="text-lg font-semibold text-secondary-900 mt-6">
            {getStatusMessage()}
          </Text>
        </View>

        {/* Progress bar */}
        <View className="mb-8">
          <View className="bg-secondary-200 rounded-full h-2">
            <View
              className="bg-primary-500 h-2 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </View>
        </View>

        {/* Steps */}
        <Card shadow="md">
          <CardContent>
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isPending = index > currentStepIndex;

              return (
                <View
                  key={step.key}
                  className={`flex-row items-center py-3 ${
                    index < STEPS.length - 1 ? 'border-b border-secondary-100' : ''
                  }`}
                >
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
                      isCompleted
                        ? 'bg-green-500'
                        : isCurrent
                        ? 'bg-primary-500'
                        : 'bg-secondary-200'
                    }`}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    ) : (
                      <Ionicons
                        name={step.icon as any}
                        size={16}
                        color={isCurrent ? '#fff' : '#94a3b8'}
                      />
                    )}
                  </View>
                  <Text
                    className={`flex-1 ${
                      isCompleted
                        ? 'text-green-600'
                        : isCurrent
                        ? 'text-secondary-900 font-medium'
                        : 'text-secondary-400'
                    }`}
                  >
                    {step.label}
                  </Text>
                  {isCurrent && (
                    <View className="bg-primary-100 px-2 py-1 rounded">
                      <Text className="text-primary-600 text-xs font-medium">
                        Em andamento
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </CardContent>
        </Card>

        {/* Dica */}
        <View className="mt-6 flex-row items-start bg-blue-50 p-4 rounded-lg">
          <Ionicons name="information-circle" size={20} color="#3b82f6" />
          <Text className="text-blue-700 text-sm ml-2 flex-1">
            Você pode sair desta tela. Notificaremos quando seus clipes estiverem prontos.
          </Text>
        </View>
      </View>

      {/* Botão para ver outros projetos */}
      <View className="px-6 py-4">
        <Button
          variant="outline"
          fullWidth
          onPress={() => router.push('/(tabs)/projects')}
        >
          Ver meus projetos
        </Button>
      </View>
    </Screen>
  );
}
