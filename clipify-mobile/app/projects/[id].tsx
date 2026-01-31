import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/shared';
import { Button, Card, CardContent, Badge } from '@/components/ui';
import { ClipCard } from '@/components/clips';
import { useJob, useDeleteJob } from '@/hooks/useJobs';
import type { Clip } from '@/types';

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error, refetch } = useJob(id || '');
  const deleteMutation = useDeleteJob();

  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);

  const handleDeleteProject = () => {
    Alert.alert(
      'Excluir Projeto',
      'Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(id!);
              router.replace('/(tabs)/projects');
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir o projeto');
            }
          },
        },
      ]
    );
  };

  const handleShareClip = async (clip: Clip) => {
    try {
      await Share.share({
        message: `Confira este clipe: ${clip.title}`,
        url: clip.downloadUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDownloadClip = (clip: Clip) => {
    Alert.alert('Em breve', 'Funcionalidade de download em desenvolvimento');
  };

  const getStatusBadge = () => {
    switch (job?.status) {
      case 'completed':
        return <Badge variant="success">Concluído</Badge>;
      case 'active':
      case 'waiting':
        return <Badge variant="warning">Processando</Badge>;
      case 'failed':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Screen className="bg-secondary-50">
        <View className="flex-1 justify-center items-center">
          <Text className="text-secondary-600">Carregando projeto...</Text>
        </View>
      </Screen>
    );
  }

  if (error || !job) {
    return (
      <Screen className="bg-secondary-50">
        <View className="flex-1 justify-center items-center px-6">
          <Ionicons name="alert-circle" size={64} color="#ef4444" />
          <Text className="text-xl font-bold text-secondary-900 mt-4">
            Projeto não encontrado
          </Text>
          <Button
            variant="hero"
            className="mt-6"
            onPress={() => router.replace('/(tabs)/projects')}
          >
            Voltar para Projetos
          </Button>
        </View>
      </Screen>
    );
  }

  const clips = job.result?.clips || [];

  return (
    <Screen scrollable className="bg-secondary-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-secondary-200">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity onPress={() => router.back()} className="mr-4">
              <Ionicons name="arrow-back" size={24} color="#1e293b" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-xl font-bold text-secondary-900" numberOfLines={1}>
                {job.title || 'Projeto sem título'}
              </Text>
              <Text className="text-secondary-500 text-sm">
                {formatDate(job.createdAt)}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleDeleteProject} className="p-2">
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Card */}
      <View className="px-6 py-4">
        <Card shadow="md">
          <CardContent>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-secondary-900 font-semibold">Status</Text>
              {getStatusBadge()}
            </View>

            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-primary-500">
                  {clips.length}
                </Text>
                <Text className="text-secondary-500 text-sm">Clipes</Text>
              </View>
              <View className="w-px bg-secondary-200" />
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-secondary-900">
                  {job.targetDuration}s
                </Text>
                <Text className="text-secondary-500 text-sm">Duração</Text>
              </View>
              <View className="w-px bg-secondary-200" />
              <View className="items-center flex-1">
                <Text className="text-2xl font-bold text-secondary-900">
                  {job.sourceType === 'youtube' ? 'YT' : 'Upload'}
                </Text>
                <Text className="text-secondary-500 text-sm">Fonte</Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Processing status */}
      {(job.status === 'active' || job.status === 'waiting') && (
        <View className="px-6 pb-4">
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: '/processing/[id]', params: { id: job.id } })
            }
          >
            <LinearGradient
              colors={['#8b5cf6', '#6d28d9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-4 rounded-lg flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Ionicons name="sync" size={24} color="#fff" />
                <View className="ml-3">
                  <Text className="text-white font-semibold">Processando...</Text>
                  <Text className="text-white/80 text-sm">
                    Toque para ver o progresso
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Clips List */}
      <View className="px-6 py-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-secondary-900">
            Clipes Gerados
          </Text>
          {clips.length > 0 && (
            <Text className="text-secondary-500">{clips.length} clipes</Text>
          )}
        </View>

        {clips.length === 0 ? (
          <Card shadow="sm">
            <CardContent className="py-12 items-center">
              <Ionicons name="film-outline" size={48} color="#cbd5e1" />
              <Text className="text-secondary-600 text-center mt-3">
                {job.status === 'completed'
                  ? 'Nenhum clipe foi gerado'
                  : 'Os clipes aparecerão aqui quando o processamento terminar'}
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className="gap-4">
            {clips.map((clip, index) => (
              <Card key={clip.id || index} shadow="md">
                <CardContent className="p-0">
                  {/* Thumbnail */}
                  <View className="bg-secondary-900 aspect-video rounded-t-lg items-center justify-center">
                    <TouchableOpacity>
                      <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                    {/* Duration badge */}
                    <View className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded">
                      <Text className="text-white text-xs font-medium">
                        {Math.round(clip.duration)}s
                      </Text>
                    </View>
                    {/* Score badge */}
                    {clip.score && (
                      <View className="absolute top-2 left-2 bg-primary-500/90 px-2 py-1 rounded flex-row items-center">
                        <Ionicons name="flame" size={12} color="#fff" />
                        <Text className="text-white text-xs font-bold ml-1">
                          {clip.score}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View className="p-4">
                    <Text className="text-secondary-900 font-semibold" numberOfLines={2}>
                      {clip.title || `Clipe ${index + 1}`}
                    </Text>
                    {clip.description && (
                      <Text className="text-secondary-500 text-sm mt-1" numberOfLines={2}>
                        {clip.description}
                      </Text>
                    )}

                    {/* Actions */}
                    <View className="flex-row mt-4 gap-2">
                      <TouchableOpacity
                        onPress={() => handleDownloadClip(clip)}
                        className="flex-1 bg-primary-50 py-2 rounded-lg flex-row items-center justify-center"
                      >
                        <Ionicons name="download-outline" size={18} color="#8b5cf6" />
                        <Text className="text-primary-500 font-medium ml-1">Baixar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleShareClip(clip)}
                        className="flex-1 bg-secondary-100 py-2 rounded-lg flex-row items-center justify-center"
                      >
                        <Ionicons name="share-outline" size={18} color="#64748b" />
                        <Text className="text-secondary-600 font-medium ml-1">
                          Compartilhar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>

      {/* Bottom padding */}
      <View className="h-6" />
    </Screen>
  );
}
