import { View, Text, TextInput, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className = '',
  ...props
}: InputProps) {
  return (
    <View className="w-full">
      {label && (
        <Text className="text-sm font-medium text-gray-700 mb-2">
          {label}
        </Text>
      )}
      <TextInput
        className={`bg-gray-50 border ${
          error ? 'border-red-500' : 'border-gray-300'
        } rounded-lg px-4 py-3 text-base text-gray-900 ${className}`}
        placeholderTextColor="#9ca3af"
        {...props}
      />
      {error && (
        <Text className="text-red-500 text-xs mt-1">{error}</Text>
      )}
      {helperText && !error && (
        <Text className="text-gray-500 text-xs mt-1">{helperText}</Text>
      )}
    </View>
  );
}
