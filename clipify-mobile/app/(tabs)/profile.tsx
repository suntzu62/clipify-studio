import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/shared';
import { Avatar, Badge, Card, CardContent } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { useJobs } from '@/hooks/useJobs';
import { useLogout } from '@/hooks/useAuth';
import { useMemo } from 'react';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: jobs } = useJobs();
  const logoutMutation = useLogout();

  // Calcular estatísticas
  const stats = useMemo(() => {
    if (!jobs) return { totalVideos: 0, totalClips: 0 };

    const totalVideos = jobs.length;
    const totalClips = jobs.reduce((acc, job) => {
      return acc + (job.result?.clips?.length || 0);
    }, 0);

    return { totalVideos, totalClips };
  }, [jobs]);

  const handleLogout = () => {
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutMutation.mutateAsync();
              router.replace('/');
            } catch (error) {
              console.error('Logout error:', error);
              // Mesmo com erro, redirecionar para landing
              router.replace('/');
            }
          },
        },
      ]
    );
  };

  const getPlanBadge = () => {
    switch (user?.plan) {
      case 'premium':
        return <Badge variant="default">Plano Premium</Badge>;
      case 'enterprise':
        return <Badge variant="success">Plano Enterprise</Badge>;
      default:
        return <Badge variant="secondary">Plano Free</Badge>;
    }
  };

  const getUserInitials = () => {
    if (!user?.fullName) return 'U';
    const names = user.fullName.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0][0].toUpperCase();
  };

  return (
    <Screen scrollable className="bg-secondary-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-secondary-200">
        <Text className="text-2xl font-bold text-secondary-900">Perfil</Text>
      </View>

      {/* User Info */}
      <View className="px-6 py-6 items-center bg-white border-b border-secondary-200">
        <Avatar
          alt={user?.fullName || 'Usuário'}
          fallback={getUserInitials()}
          src={user?.profilePicture}
          size="xl"
          className="mb-4"
        />
        <Text className="text-xl font-bold text-secondary-900">
          {user?.fullName || 'Usuário'}
        </Text>
        <Text className="text-secondary-600 mb-3">{user?.email || 'email@exemplo.com'}</Text>

        {getPlanBadge()}

        <TouchableOpacity className="mt-4 bg-primary-50 px-6 py-2 rounded-lg">
          <Text className="text-primary-500 font-semibold">Editar perfil</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View className="px-6 py-6">
        <Card shadow="md">
          <CardContent className="flex-row justify-around py-4">
            <View className="items-center">
              <Text className="text-2xl font-bold text-secondary-900">
                {stats.totalVideos}
              </Text>
              <Text className="text-secondary-600 text-sm">Vídeos</Text>
            </View>
            <View className="w-px bg-secondary-200" />
            <View className="items-center">
              <Text className="text-2xl font-bold text-secondary-900">
                {stats.totalClips}
              </Text>
              <Text className="text-secondary-600 text-sm">Clipes</Text>
            </View>
            <View className="w-px bg-secondary-200" />
            <View className="items-center">
              <Text className="text-2xl font-bold text-secondary-900">
                {stats.totalVideos}
              </Text>
              <Text className="text-secondary-600 text-sm">Projetos</Text>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Menu Options */}
      <View className="px-6 pb-6">
        <View className="gap-2">
          <TouchableOpacity>
            <Card shadow="sm">
              <CardContent className="flex-row items-center justify-between py-4">
                <View className="flex-row items-center">
                  <View className="bg-primary-50 p-2 rounded-lg">
                    <Ionicons name="settings-outline" size={24} color="#8b5cf6" />
                  </View>
                  <Text className="ml-3 text-secondary-900 font-medium">Configurações</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748b" />
              </CardContent>
            </Card>
          </TouchableOpacity>

          {user?.plan !== 'enterprise' && (
            <TouchableOpacity>
              <LinearGradient
                colors={['#8b5cf6', '#6d28d9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="rounded-lg"
                style={{
                  shadowColor: '#8b5cf6',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View className="flex-row items-center justify-between p-4">
                  <View className="flex-row items-center">
                    <View className="bg-white/20 p-2 rounded-lg">
                      <Ionicons name="diamond-outline" size={24} color="#fff" />
                    </View>
                    <View className="ml-3">
                      <Text className="text-white font-semibold">
                        {user?.plan === 'premium' ? 'Upgrade para Enterprise' : 'Upgrade para Premium'}
                      </Text>
                      <Text className="text-white/80 text-xs">Desbloqueie todos os recursos</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <TouchableOpacity>
            <Card shadow="sm">
              <CardContent className="flex-row items-center justify-between py-4">
                <View className="flex-row items-center">
                  <View className="bg-secondary-100 p-2 rounded-lg">
                    <Ionicons name="help-circle-outline" size={24} color="#64748b" />
                  </View>
                  <Text className="ml-3 text-secondary-900 font-medium">Ajuda e Suporte</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748b" />
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity>
            <Card shadow="sm">
              <CardContent className="flex-row items-center justify-between py-4">
                <View className="flex-row items-center">
                  <View className="bg-secondary-100 p-2 rounded-lg">
                    <Ionicons name="document-text-outline" size={24} color="#64748b" />
                  </View>
                  <Text className="ml-3 text-secondary-900 font-medium">Termos de Uso</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748b" />
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity>
            <Card shadow="sm">
              <CardContent className="flex-row items-center justify-between py-4">
                <View className="flex-row items-center">
                  <View className="bg-secondary-100 p-2 rounded-lg">
                    <Ionicons name="information-circle-outline" size={24} color="#64748b" />
                  </View>
                  <Text className="ml-3 text-secondary-900 font-medium">Sobre</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748b" />
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} className="mt-4">
            <Card shadow="sm" className="border-2 border-red-100">
              <CardContent className="flex-row items-center py-4">
                <View className="bg-red-50 p-2 rounded-lg">
                  <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                </View>
                <Text className="ml-3 text-red-500 font-medium">Sair da conta</Text>
              </CardContent>
            </Card>
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-6 py-4 items-center">
        <Text className="text-secondary-500 text-sm">Clipify v1.0.0</Text>
        <Text className="text-secondary-400 text-xs mt-1">
          Desenvolvido por CortAI
        </Text>
      </View>
    </Screen>
  );
}
