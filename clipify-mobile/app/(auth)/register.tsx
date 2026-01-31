import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useRegister } from '@/hooks/useAuth';

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const registerMutation = useRegister();

  const handleRegister = async () => {
    // Validação
    if (!email || !password || !confirmPassword) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Erro', 'Email inválido');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem');
      return;
    }

    try {
      await registerMutation.mutateAsync({
        email,
        password,
        fullName: fullName || undefined,
      });

      // Redirecionar para home
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert(
        'Erro no registro',
        error.response?.data?.message || 'Erro ao criar conta'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center px-6 py-12">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-4xl font-bold text-secondary-900 mb-2">
              Criar conta
            </Text>
            <Text className="text-secondary-600 text-base">
              Comece a criar vídeos virais hoje mesmo
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4">
            {/* Nome completo (opcional) */}
            <View>
              <Text className="text-sm font-semibold text-secondary-900 mb-2">
                Nome completo <Text className="text-secondary-400">(opcional)</Text>
              </Text>
              <TextInput
                className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-4 text-base text-secondary-900"
                placeholder="João Silva"
                placeholderTextColor="#94a3b8"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
                editable={!registerMutation.isPending}
              />
            </View>

            {/* Email */}
            <View>
              <Text className="text-sm font-semibold text-secondary-900 mb-2">
                Email *
              </Text>
              <TextInput
                className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-4 text-base text-secondary-900"
                placeholder="seu@email.com"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!registerMutation.isPending}
              />
            </View>

            {/* Senha */}
            <View>
              <Text className="text-sm font-semibold text-secondary-900 mb-2">
                Senha * <Text className="text-secondary-400">(mín. 6 caracteres)</Text>
              </Text>
              <TextInput
                className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-4 text-base text-secondary-900"
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password-new"
                editable={!registerMutation.isPending}
              />
            </View>

            {/* Confirmar senha */}
            <View>
              <Text className="text-sm font-semibold text-secondary-900 mb-2">
                Confirmar senha *
              </Text>
              <TextInput
                className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-4 text-base text-secondary-900"
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="password-new"
                editable={!registerMutation.isPending}
              />
            </View>

            {/* Botão Criar conta */}
            <TouchableOpacity
              className="mt-4"
              onPress={handleRegister}
              disabled={registerMutation.isPending}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#8b5cf6', '#6d28d9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="py-4 rounded-xl items-center justify-center"
                style={{
                  shadowColor: '#8b5cf6',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white text-center font-bold text-lg">
                    Criar conta
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Link para login */}
            <View className="flex-row justify-center items-center mt-6">
              <Text className="text-secondary-600">Já tem uma conta? </Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                disabled={registerMutation.isPending}
              >
                <Text className="text-primary-500 font-bold">
                  Entrar
                </Text>
              </TouchableOpacity>
            </View>

            {/* Termos */}
            <Text className="text-center text-secondary-500 text-xs mt-4">
              Ao criar uma conta, você concorda com nossos{'\n'}
              <Text className="text-primary-500">Termos de Serviço</Text> e{' '}
              <Text className="text-primary-500">Política de Privacidade</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
