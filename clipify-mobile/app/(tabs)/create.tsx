import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/shared';
import { UploadZone } from '@/components/clips';

export default function CreateScreen() {
  const router = useRouter();
  const [selectedVideo, setSelectedVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const handleVideoSelected = (video: ImagePicker.ImagePickerAsset) => {
    setSelectedVideo(video);
    console.log('Video selected:', video.uri);
  };

  const handleUploadComplete = (result: {
    storagePath: string;
    fileName: string;
    video: ImagePicker.ImagePickerAsset;
  }) => {
    console.log('Upload complete:', result);

    // Navegar para tela de configuração com os dados do upload
    router.push({
      pathname: '/configure',
      params: {
        storagePath: result.storagePath,
        fileName: result.fileName,
        videoUri: result.video.uri,
        duration: result.video.duration?.toString() || '0',
      },
    });
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error);
    setSelectedVideo(null);
  };

  return (
    <Screen scrollable className="bg-secondary-50">
      <UploadZone
        onVideoSelected={handleVideoSelected}
        onUploadComplete={handleUploadComplete}
        onUploadError={handleUploadError}
        className="px-6 py-6"
      />
    </Screen>
  );
}
