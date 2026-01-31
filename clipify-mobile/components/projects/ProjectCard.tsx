import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardContent, Badge } from '../ui';
import { LinearGradient } from 'expo-linear-gradient';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    duration?: number;
    status: 'processing' | 'ready' | 'error';
    createdAt: string;
    updatedAt: string;
    clipsCount?: number;
  };
  onPress?: () => void;
  onMoreOptions?: () => void;
}

/**
 * ProjectCard - Card de projeto replicando o visual do web
 * Exibe thumbnail, nome, status, data e contagem de clips
 */
export function ProjectCard({ project, onPress, onMoreOptions }: ProjectCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getStatusConfig = () => {
    switch (project.status) {
      case 'processing':
        return {
          badge: <Badge variant="warning">Processando</Badge>,
          icon: 'hourglass-outline' as const,
          color: '#f59e0b',
        };
      case 'ready':
        return {
          badge: <Badge variant="success">Pronto</Badge>,
          icon: 'checkmark-circle' as const,
          color: '#16a34a',
        };
      case 'error':
        return {
          badge: <Badge variant="error">Erro</Badge>,
          icon: 'alert-circle' as const,
          color: '#ef4444',
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <Card shadow="md" className="mb-4">
      <TouchableOpacity onPress={onPress} disabled={!onPress}>
        {/* Thumbnail com overlay */}
        <View className="relative">
          {project.thumbnailUrl ? (
            <Image
              source={{ uri: project.thumbnailUrl }}
              className="w-full h-40 rounded-t-lg"
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#8b5cf6', '#6d28d9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="w-full h-40 rounded-t-lg items-center justify-center"
            >
              <Ionicons name="videocam-outline" size={56} color="#fff" />
            </LinearGradient>
          )}

          {/* Status badge no top right */}
          <View className="absolute top-3 right-3">
            {statusConfig.badge}
          </View>

          {/* More options button */}
          {onMoreOptions && (
            <View className="absolute top-3 left-3">
              <TouchableOpacity
                onPress={onMoreOptions}
                className="bg-black/60 p-2 rounded-full"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Card Content */}
        <CardContent>
          {/* Nome do projeto */}
          <Text
            className="text-lg font-semibold text-secondary-900 mb-2"
            numberOfLines={2}
          >
            {project.name}
          </Text>

          {/* Metadata */}
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Ionicons name="time-outline" size={14} color="#64748b" />
              <Text className="text-sm text-secondary-500 ml-1">
                {formatDate(project.updatedAt)}
              </Text>
            </View>

            {project.clipsCount !== undefined && (
              <View className="flex-row items-center">
                <Ionicons name="film-outline" size={14} color="#64748b" />
                <Text className="text-sm text-secondary-500 ml-1">
                  {project.clipsCount} {project.clipsCount === 1 ? 'clip' : 'clips'}
                </Text>
              </View>
            )}
          </View>

          {/* Status indicator */}
          <View className="flex-row items-center">
            <Ionicons
              name={statusConfig.icon}
              size={16}
              color={statusConfig.color}
            />
            <Text
              className="text-sm font-medium ml-1"
              style={{ color: statusConfig.color }}
            >
              {project.status === 'processing' && 'Processando vídeo...'}
              {project.status === 'ready' && 'Pronto para editar'}
              {project.status === 'error' && 'Erro no processamento'}
            </Text>
          </View>
        </CardContent>
      </TouchableOpacity>
    </Card>
  );
}
