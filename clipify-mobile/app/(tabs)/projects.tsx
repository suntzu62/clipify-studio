import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/shared';
import { ProjectCard } from '@/components/projects';
import { Button } from '@/components/ui';
import { useJobs, useDeleteJob } from '@/hooks/useJobs';
import { useMemo, useCallback, useState } from 'react';
import { Alert, ActionSheetIOS, Platform } from 'react-native';

export default function ProjectsScreen() {
  const router = useRouter();
  const { data: jobs, isLoading, refetch } = useJobs();
  const deleteMutation = useDeleteJob();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Converter jobs para formato de projetos
  const projects = useMemo(() => {
    if (!jobs) return [];

    return jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((job) => ({
        id: job.id,
        name: job.title || 'Projeto sem título',
        thumbnailUrl: job.result?.clips?.[0]?.thumbnailUrl,
        status: job.status === 'completed' ? 'ready' as const :
                job.status === 'failed' ? 'error' as const : 'processing' as const,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt || job.createdAt,
        clipsCount: job.result?.clips?.length || 0,
      }));
  }, [jobs]);

  const handleProjectPress = (projectId: string) => {
    router.push({ pathname: '/projects/[id]', params: { id: projectId } });
  };

  const handleMoreOptions = (projectId: string) => {
    const actions = ['Ver detalhes', 'Excluir projeto', 'Cancelar'];
    const destructiveButtonIndex = 1;
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: actions,
          destructiveButtonIndex,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleProjectPress(projectId);
          } else if (buttonIndex === 1) {
            confirmDelete(projectId);
          }
        }
      );
    } else {
      // Android - usar Alert
      Alert.alert(
        'Opções do Projeto',
        'O que você deseja fazer?',
        [
          { text: 'Ver detalhes', onPress: () => handleProjectPress(projectId) },
          { text: 'Excluir projeto', style: 'destructive', onPress: () => confirmDelete(projectId) },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    }
  };

  const confirmDelete = (projectId: string) => {
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
              await deleteMutation.mutateAsync(projectId);
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir o projeto');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <Screen
      scrollable
      className="bg-secondary-50"
      refreshing={isLoading}
      onRefresh={onRefresh}
    >
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-secondary-200">
        <Text className="text-2xl font-bold text-secondary-900">Meus Projetos</Text>
        <Text className="text-secondary-600 mt-1">
          {projects.length > 0
            ? `${projects.length} projeto${projects.length !== 1 ? 's' : ''}`
            : 'Gerencie todos os seus vídeos'}
        </Text>
      </View>

      <View className="flex-1 px-6 py-6">
        {projects.length === 0 ? (
          /* Empty state */
          <View className="flex-1 justify-center items-center py-20">
            <View className="bg-primary-50 p-6 rounded-full mb-4">
              <Ionicons name="folder-open-outline" size={48} color="#8b5cf6" />
            </View>
            <Text className="text-xl font-semibold text-secondary-900 mb-2">
              Nenhum projeto ainda
            </Text>
            <Text className="text-secondary-600 text-center mb-6">
              Comece criando seu primeiro vídeo{'\n'}para ver seus projetos aqui
            </Text>
            <Button
              variant="hero"
              size="lg"
              onPress={() => router.push('/create')}
            >
              Criar primeiro projeto
            </Button>
          </View>
        ) : (
          /* Projects list */
          <View>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onPress={() => handleProjectPress(project.id)}
                onMoreOptions={() => handleMoreOptions(project.id)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
