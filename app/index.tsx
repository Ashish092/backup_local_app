import { Redirect } from 'expo-router';

export default function Index() {
  // This will be handled by the root layout based on auth state
  // Just redirect to auth/login as a fallback
  return <Redirect href="/auth/login" />;
}
