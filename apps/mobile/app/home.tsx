import React from 'react';
import { Redirect } from 'expo-router';

/** This route is no longer used; always send users to Menu. */
export default function HomeRoute() {
  return <Redirect href="/menu" />;
}
