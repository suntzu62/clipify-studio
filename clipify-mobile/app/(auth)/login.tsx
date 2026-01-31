import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useLogin } from '@/hooks/useAuth';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useLogin();

  const handleLogin = async () => {
    // Validação
    if (!email || !password) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Erro', 'Email inválido');
      return;
    }

    try {
      await loginMutation.mutateAsync({ email, password });

      // Redirecionar para home
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert(
        'Erro no login',
        error.response?.data?.message || 'Credenciais inválidas'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-4xl font-bold text-secondary-900 mb-2">
            Bem-vindo de volta
          </Text>
          <Text className="text-secondary-600 text-base">
            Entre para continuar criando conteúdo viral
          </Text>
        </View>

        {/* Form */}
        <View className="gap-4">
          {/* Email */}
          <View>
            <Text className="text-sm font-semibold text-secondary-900 mb-2">
              Email
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
              editable={!loginMutation.isPending}
            />
          </View>

          {/* Senha */}
          <View>
            <Text className="text-sm font-semibold text-secondary-900 mb-2">
              Senha
            </Text>
            <TextInput
              className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-4 text-base text-secondary-900"
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!loginMutation.isPending}
            />
          </View>

          {/* Esqueceu senha */}
          <TouchableOpacity disabled={loginMutation.isPending}>
            <Text className="text-primary-500 text-sm font-semibold text-right">
              Esqueceu a senha?
            </Text>
          </TouchableOpacity>

          {/* Botão Login */}
          <TouchableOpacity
            className="mt-4"
            onPress={handleLogin}
            disabled={loginMutation.isPending}
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
              {loginMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-center font-bold text-lg">
                  Entrar
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Link para registro */}
          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-secondary-600">Não tem uma conta? </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              disabled={loginMutation.isPending}
            >
              <Text className="text-primary-500 font-bold">
                Criar conta
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
