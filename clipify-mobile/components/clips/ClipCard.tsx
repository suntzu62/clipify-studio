import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardContent, Badge } from '../ui';
import { LinearGradient } from 'expo-linear-gradient';

interface ClipCardProps {
  clip: {
    id: string;
    title: string;
    thumbnailUrl?: string;
    duration: number;
    status: 'processing' | 'ready' | 'error';
    viralScore?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  };
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
}

/**
 * ClipCard - Card de clip replicando o ClipCard.tsx do web
 * Exibe thumbnail, título, duração, status e ações
 */
export function ClipCard({
  clip,
  onPress,
  onEdit,
  onDelete,
  onShare,
}: ClipCardProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (clip.status) {
      case 'processing':
        return <Badge variant="warning">Processando</Badge>;
      case 'ready':
        return <Badge variant="success">Pronto</Badge>;
      case 'error':
        return <Badge variant="error">Erro</Badge>;
      default:
        return null;
    }
  };

  const getAspectRatioIcon = () => {
    switch (clip.aspectRatio) {
      case '9:16':
        return 'phone-portrait-outline';
      case '1:1':
        return 'square-outline';
      case '4:5':
        return 'tablet-portrait-outline';
      default:
        return 'tv-outline';
    }
  };

  return (
    <Card shadow="md" className="mb-4">
      <TouchableOpacity onPress={onPress} disabled={!onPress}>
        {/* Thumbnail com overlay */}
        <View className="relative">
          {clip.thumbnailUrl ? (
            <Image
              source={{ uri: clip.thumbnailUrl }}
              className="w-full h-48 rounded-t-lg"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-48 bg-secondary-100 rounded-t-lg items-center justify-center">
              <Ionicons name="film-outline" size={48} color="#cbd5e1" />
            </View>
          )}

          {/* Overlay gradiente no bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            className="absolute bottom-0 left-0 right-0 h-20 justify-end p-3"
          >
            <View className="flex-row items-center justify-between">
              {/* Duração */}
              <View className="flex-row items-center bg-black/60 px-2 py-1 rounded">
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text className="text-white text-xs font-medium ml-1">
                  {formatDuration(clip.duration)}
                </Text>
              </View>

              {/* Aspect Ratio */}
              {clip.aspectRatio && (
                <View className="flex-row items-center bg-black/60 px-2 py-1 rounded">
                  <Ionicons
                    name={getAspectRatioIcon() as any}
                    size={14}
                    color="#fff"
                  />
                  <Text className="text-white text-xs font-medium ml-1">
                    {clip.aspectRatio}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>

          {/* Status badge no top right */}
          <View className="absolute top-3 right-3">
            {getStatusBadge()}
          </View>

          {/* Viral Score - se disponível */}
          {clip.viralScore !== undefined && clip.viralScore > 0 && (
            <View className="absolute top-3 left-3">
              <View className="flex-row items-center bg-primary-500 px-2 py-1 rounded-full">
                <Ionicons name="flame" size={14} color="#fff" />
                <Text className="text-white text-xs font-bold ml-1">
                  {Math.round(clip.viralScore)}%
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Card Content */}
        <CardContent>
          <Text className="text-lg font-semibold text-secondary-900 mb-3">
            {clip.title}
          </Text>

          {/* Action buttons */}
          <View className="flex-row items-center gap-2">
            {onEdit && (
              <TouchableOpacity
                onPress={onEdit}
                className="flex-1 flex-row items-center justify-center bg-primary-50 active:bg-primary-100 px-4 py-2 rounded-lg"
              >
                <Ionicons name="create-outline" size={18} color="#8b5cf6" />
                <Text className="text-primary-500 font-medium ml-2">
                  Editar
                </Text>
              </TouchableOpacity>
            )}

            {onShare && (
              <TouchableOpacity
                onPress={onShare}
                className="flex-row items-center justify-center bg-secondary-100 active:bg-secondary-200 px-4 py-2 rounded-lg"
              >
                <Ionicons name="share-outline" size={18} color="#64748b" />
              </TouchableOpacity>
            )}

            {onDelete && (
              <TouchableOpacity
                onPress={onDelete}
                className="flex-row items-center justify-center bg-red-50 active:bg-red-100 px-4 py-2 rounded-lg"
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </CardContent>
      </TouchableOpacity>
    </Card>
  );
}
