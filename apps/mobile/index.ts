import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and additionally ensures Expo's own environment (dev client, Expo Go, or
// a standalone build) is set up correctly, whichever is running this.
registerRootComponent(App);
