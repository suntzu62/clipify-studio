import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/shared';
import { Card, CardContent } from '@/components/ui';
import { ProjectCard } from '@/components/projects';
import { useAuthStore } from '@/stores';
import { useJobs } from '@/hooks/useJobs';
import { useMemo, useCallback } from 'react';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: jobs, isLoading, refetch } = useJobs();

  // Calcular estatísticas
  const stats = useMemo(() => {
    if (!jobs) return { totalVideos: 0, totalClips: 0, recentProjects: [] };

    const totalVideos = jobs.length;
    const totalClips = jobs.reduce((acc, job) => {
      return acc + (job.result?.clips?.length || 0);
    }, 0);

    // Projetos recentes (últimos 3)
    const recentProjects = jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
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

    return { totalVideos, totalClips, recentProjects };
  }, [jobs]);

  const getUserFirstName = () => {
    if (!user?.fullName) return 'Usuário';
    return user.fullName.split(' ')[0];
  };

  const handleProjectPress = (projectId: string) => {
    router.push({ pathname: '/projects/[id]', params: { id: projectId } });
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
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-secondary-900">
              Olá, {getUserFirstName()}! 👋
            </Text>
            <Text className="text-secondary-600 mt-1">
              Pronto para criar conteúdo viral?
            </Text>
          </View>
          <TouchableOpacity className="bg-primary-50 p-3 rounded-full">
            <Ionicons name="notifications-outline" size={24} color="#8b5cf6" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Cards */}
      <View className="px-6 py-6">
        <View className="flex-row justify-between gap-3">
          <Card shadow="md" className="flex-1">
            <CardContent className="py-4">
              <Ionicons name="videocam" size={28} color="#8b5cf6" />
              <Text className="text-2xl font-bold text-secondary-900 mt-2">
                {stats.totalVideos}
              </Text>
              <Text className="text-secondary-600 text-sm">Vídeos criados</Text>
            </CardContent>
          </Card>
          <Card shadow="md" className="flex-1">
            <CardContent className="py-4">
              <Ionicons name="cut" size={28} color="#8b5cf6" />
              <Text className="text-2xl font-bold text-secondary-900 mt-2">
                {stats.totalClips}
              </Text>
              <Text className="text-secondary-600 text-sm">Clipes gerados</Text>
            </CardContent>
          </Card>
        </View>
      </View>

      {/* Quick Actions */}
      <View className="px-6 pb-6">
        <Text className="text-lg font-bold text-secondary-900 mb-4">
          Ações rápidas
        </Text>
        <View className="gap-3">
          <TouchableOpacity onPress={() => router.push('/create')}>
            <LinearGradient
              colors={['#8b5cf6', '#6d28d9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-4 rounded-lg flex-row items-center justify-between"
              style={{
                shadowColor: '#8b5cf6',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <View className="flex-row items-center">
                <View className="bg-white/20 p-3 rounded-lg mr-3">
                  <Ionicons name="cloud-upload" size={24} color="#ffffff" />
                </View>
                <View>
                  <Text className="text-white font-semibold text-base">
                    Novo vídeo
                  </Text>
                  <Text className="text-white/80 text-sm">
                    Faça upload e crie clips
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/projects')}>
            <Card shadow="md">
              <CardContent className="flex-row items-center justify-between py-4">
                <View className="flex-row items-center">
                  <View className="bg-primary-50 p-3 rounded-lg mr-3">
                    <Ionicons name="folder-open" size={24} color="#8b5cf6" />
                  </View>
                  <View>
                    <Text className="text-secondary-900 font-semibold text-base">
                      Meus projetos
                    </Text>
                    <Text className="text-secondary-600 text-sm">
                      {stats.totalVideos > 0
                        ? `${stats.totalVideos} projeto${stats.totalVideos !== 1 ? 's' : ''}`
                        : 'Acesse seus projetos salvos'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#64748b" />
              </CardContent>
            </Card>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Projects */}
      <View className="px-6 pb-6">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-bold text-secondary-900">
            Projetos recentes
          </Text>
          {stats.recentProjects.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/projects')}>
              <Text className="text-primary-500 font-medium">Ver todos</Text>
            </TouchableOpacity>
          )}
        </View>

        {stats.recentProjects.length === 0 ? (
          <Card shadow="sm">
            <CardContent className="py-12 items-center">
              <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
              <Text className="text-secondary-600 text-center mt-3">
                Nenhum projeto ainda
              </Text>
              <Text className="text-secondary-500 text-center text-sm mt-1">
                Crie seu primeiro vídeo para começar
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View>
            {stats.recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onPress={() => handleProjectPress(project.id)}
                onMoreOptions={() => {}}
              />
            ))}
          </View>
        )}
      </View>

      {/* Tips Section */}
      {stats.totalVideos === 0 && (
        <View className="px-6 pb-6">
          <Card shadow="sm" className="bg-primary-50 border border-primary-100">
            <CardContent>
              <View className="flex-row items-start">
                <Ionicons name="bulb" size={24} color="#8b5cf6" />
                <View className="flex-1 ml-3">
                  <Text className="text-secondary-900 font-semibold">
                    Dica para começar
                  </Text>
                  <Text className="text-secondary-600 text-sm mt-1">
                    Faça upload de um vídeo longo e deixe a IA identificar os melhores
                    momentos para criar clipes virais automaticamente.
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </View>
      )}
    </Screen>
  );
}
