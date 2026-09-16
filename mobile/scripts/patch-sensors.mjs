import fs from 'fs';
import path from 'path';

const file = path.join(import.meta.dirname, 'node_modules', 'react-native-sensors', 'android', 'build.gradle');

if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('jcenter()')) {
    content = content.replaceAll('jcenter()', 'mavenCentral()');
    fs.writeFileSync(file, content, 'utf8');
    console.log('[postinstall] Patched react-native-sensors build.gradle (removed jcenter)');
  }
}
