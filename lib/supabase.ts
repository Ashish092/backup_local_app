import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ============================================================================
// APP SUPABASE CLIENT (For app features: users, jobs, notifications, bids)
// ============================================================================

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ============================================================================
// BOOKING SUPABASE CLIENT (For existing booking system - separate database)
// ============================================================================

const bookingSupabaseUrl = process.env.EXPO_PUBLIC_BOOKING_SUPABASE_URL || supabaseUrl;
const bookingSupabaseAnonKey = process.env.EXPO_PUBLIC_BOOKING_SUPABASE_ANON_KEY || supabaseAnonKey;

// Custom storage adapter that works on both native and web
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      return AsyncStorage.setItem(key, value);
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      return AsyncStorage.removeItem(key);
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// Main app Supabase client (for authentication and app-specific data)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Booking Supabase client (read-only access to booking system)
// This connects to your existing booking database
export const bookingSupabase = createClient(bookingSupabaseUrl, bookingSupabaseAnonKey, {
  auth: {
    // No auth needed for booking client - it's read-only via service role or public access
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
