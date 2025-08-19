import { Redirect } from 'expo-router';

/** Make /menu the app's landing page for everyone */
export default function IndexRoute() {
  return <Redirect href="/menu" />;
}
