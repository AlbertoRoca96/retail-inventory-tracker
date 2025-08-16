import React, { useState } from 'react';
import { SafeAreaView, Text, StyleSheet, StatusBar } from 'react-native';
import { useAuth } from './src/hooks/useAuth';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CreateFormScreen from './src/screens/CreateFormScreen';
import ViewSubmissionsScreen from './src/screens/ViewSubmissionsScreen';
import AdminScreen from './src/screens/AdminScreen';
import { theme } from './src/theme';

type Route = 'home' | 'create' | 'view' | 'admin';

export default function App() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<Route>('home');

  if (loading) return <SafeAreaView><Text>Loading...</Text></SafeAreaView>;
  if (!user) return <LoginScreen onLoggedIn={() => {}} />;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {route === 'home' && <HomeScreen onNavigate={setRoute} />}
      {route === 'create' && <CreateFormScreen onBack={() => setRoute('home')} />}
      {route === 'view' && <ViewSubmissionsScreen onBack={() => setRoute('home')} />}
      {route === 'admin' && <AdminScreen onBack={() => setRoute('home')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white, padding: theme.spacing(2) }
});
