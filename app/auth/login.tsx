import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (loginMode === 'email') {
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }

      setLoading(true);
      setError('');

      try {
        await signIn(email, password);
        router.replace('/(tabs)');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    } else {
      // Phone + PIN login
      if (!phone || !pin) {
        setError('Please fill in all fields');
        return;
      }

      setLoading(true);
      setError('');

      try {
        // First verify phone + PIN match in our database
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, pin')
          .eq('phone', phone)
          .single();

        if (userError || !userData) {
          throw new Error('Phone number not found');
        }

        if (userData.pin !== pin) {
          throw new Error('Invalid PIN');
        }

        // Now sign in with their email and PIN as password
        // (Admin should set user password = PIN when creating workers)
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: userData.email,
          password: pin,
        });

        if (authError) {
          throw new Error('Authentication failed. Please contact admin or use email login.');
        }

        router.replace('/(tabs)');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo and Title */}
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <Image 
              source={require('@/assets/images/icon.png')} 
              style={styles.logo}
            />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Cleaning</Text>
            <Text style={styles.subtitle}>Professionals</Text>
          </View>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          {loginMode === 'email' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity 
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons 
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
                    size={22} 
                    color="#999" 
                  />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor="#999"
                value={phone}
                onChangeText={setPhone}
                editable={!loading}
                keyboardType="phone-pad"
              />

              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="PIN"
                  placeholderTextColor="#999"
                  value={pin}
                  onChangeText={setPin}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  keyboardType="numeric"
                  maxLength={6}
                />
                <TouchableOpacity 
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons 
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
                    size={22} 
                    color="#999" 
                  />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Forgot Password */}
          <View style={styles.optionsRow}>
            <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
              <Text style={styles.forgotText}>Forget password?</Text>
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Or Sign In With Phone */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign in with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Phone/Email Toggle Button */}
          <TouchableOpacity 
            style={styles.alternateButton}
            onPress={() => {
              setLoginMode(loginMode === 'email' ? 'phone' : 'email');
              setError('');
            }}
          >
            <Ionicons 
              name={loginMode === 'email' ? 'call' : 'mail'} 
              size={24} 
              color="#0066cc" 
            />
            <Text style={styles.alternateText}>
              {loginMode === 'email' ? 'Phone Number' : 'Email'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  logoWrapper: {
    marginRight: 16,
    shadowColor: '#0066cc',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  logo: {
    width: 70,
    height: 70,
  },
  titleContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0066cc',
    lineHeight: 34,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 17,
    color: '#6B7280',
    fontWeight: '600',
    lineHeight: 18,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  eyeIcon: {
    paddingHorizontal: 16,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  forgotText: {
    fontSize: 14,
    color: '#0066cc',
    fontWeight: '600',
  },
  error: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#0066cc',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#999',
  },
  alternateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  alternateText: {
    fontSize: 16,
    color: '#0066cc',
    fontWeight: '600',
  },
});
