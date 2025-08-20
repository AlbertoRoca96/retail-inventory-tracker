import React from 'react';
import LoginScreen from '../src/screens/LoginScreen';

// Import your logo so Metro (native) & Metro Web both bundle it.
// Put the file at: apps/mobile/assets/logo.png
const logo = require('../assets/logo.png');

export default function LoginRoute() {
  // LoginScreen can optionally read `logoSource` and render it.
  // (See the small note below if your LoginScreen doesn't accept this prop yet.)
  return <LoginScreen logoSource={logo} />;
}
