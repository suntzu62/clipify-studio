import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, CardContent } from '../ui';
import { useUploadVideo } from '@/hooks/useJobs';
import { useAuthStore } from '@/stores';

interface UploadZoneProps {
  onVideoSelected?: (video: ImagePicker.ImagePickerAsset) => void;
  onUploadComplete?: (result: { storagePath: string; fileName: string; video: ImagePicker.ImagePickerAsset }) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
}

/**
 * UploadZone - Zona de upload de vídeos replicando FileUploadZone.tsx do web
 * Permite seleção de vídeo da galeria ou gravação nova
 */
export function UploadZone({
  onVideoSelected,
  onUploadComplete,
  onUploadError,
  className = '',
}: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const { user } = useAuthStore();
  const uploadMutation = useUploadVideo();

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Precisamos de permissão para acessar sua galeria de vídeos');
      return false;
    }
    return true;
  };

  const requestCameraPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Precisamos de permissão para acessar sua câmera');
      return false;
    }
    return true;
  };

  const pickVideo = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 600, // 10 minutos
    });

    if (!result.canceled && result.assets[0]) {
      onVideoSelected?.(result.assets[0]);
      await handleUpload(result.assets[0]);
    }
  };

  const recordVideo = async () => {
    const hasPermission = await requestCameraPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 600,
    });

    if (!result.canceled && result.assets[0]) {
      onVideoSelected?.(result.assets[0]);
      await handleUpload(result.assets[0]);
    }
  };

  const handleUpload = async (video: ImagePicker.ImagePickerAsset) => {
    if (!user?.id) {
      Alert.alert('Erro', 'Você precisa estar logado para fazer upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparando upload...');

    try {
      const result = await uploadMutation.mutateAsync({
        uri: video.uri,
        userId: user.id,
        onProgress: (progress) => {
          setUploadProgress(progress);
          if (progress < 30) {
            setUploadStatus('Enviando vídeo...');
          } else if (progress < 70) {
            setUploadStatus('Processando...');
          } else if (progress < 100) {
            setUploadStatus('Finalizando...');
          } else {
            setUploadStatus('Upload completo!');
          }
        },
      });

      setUploading(false);
      setUploadProgress(100);
      onUploadComplete?.({ ...result, video });
    } catch (error: any) {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');

      const errorMessage = error.response?.data?.message || error.message || 'Erro ao fazer upload';
      Alert.alert('Erro no upload', errorMessage);
      onUploadError?.(error);
    }
  };

  if (uploading) {
    return (
      <Card className={`mb-4 ${className}`}>
        <CardContent className="items-center py-8">
          <View className="bg-primary-100 p-4 rounded-full mb-4">
            <ActivityIndicator size="large" color="#8b5cf6" />
          </View>
          <Text className="text-secondary-900 font-semibold text-lg mt-2">
            {uploadStatus || 'Fazendo upload...'}
          </Text>
          <View className="w-full bg-secondary-200 rounded-full h-3 mt-4">
            <View
              className="bg-primary-500 h-3 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </View>
          <Text className="text-secondary-500 text-sm mt-2">
            {uploadProgress}% concluído
          </Text>
          <Text className="text-secondary-400 text-xs mt-4 text-center">
            Por favor, não feche o aplicativo durante o upload
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <View className={className}>
      {/* Título */}
      <Text className="text-2xl font-bold text-secondary-900 mb-2">
        Criar novo vídeo
      </Text>
      <Text className="text-secondary-500 mb-6">
        Faça upload de um vídeo ou grave um novo para começar
      </Text>

      {/* Opções de upload */}
      <View className="gap-4">
        {/* Upload da galeria */}
        <TouchableOpacity onPress={pickVideo}>
          <LinearGradient
            colors={['#8b5cf6', '#6d28d9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-lg p-6"
            style={{
              shadowColor: '#8b5cf6',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <View className="flex-row items-center">
              <View className="bg-white/20 p-3 rounded-full">
                <Ionicons name="cloud-upload-outline" size={32} color="#fff" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white text-lg font-bold">
                  Upload da galeria
                </Text>
                <Text className="text-white/80 text-sm mt-1">
                  Escolha um vídeo existente
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Gravar vídeo */}
        <TouchableOpacity onPress={recordVideo}>
          <Card shadow="md">
            <CardContent className="flex-row items-center py-4">
              <View className="bg-primary-50 p-3 rounded-full">
                <Ionicons name="videocam-outline" size={32} color="#8b5cf6" />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-secondary-900 text-lg font-bold">
                  Gravar vídeo
                </Text>
                <Text className="text-secondary-500 text-sm mt-1">
                  Use a câmera para gravar
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#64748b" />
            </CardContent>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Features */}
      <View className="mt-6 gap-3">
        <View className="flex-row items-start">
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text className="text-secondary-600 ml-3 flex-1">
            Cortes automáticos em segundos
          </Text>
        </View>
        <View className="flex-row items-start">
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text className="text-secondary-600 ml-3 flex-1">
            Legendas automáticas geradas por IA
          </Text>
        </View>
        <View className="flex-row items-start">
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text className="text-secondary-600 ml-3 flex-1">
            Reenquadramento inteligente para vertical
          </Text>
        </View>
        <View className="flex-row items-start">
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text className="text-secondary-600 ml-3 flex-1">
            Análise de viralidade com pontuação
          </Text>
        </View>
      </View>
    </View>
  );
}
