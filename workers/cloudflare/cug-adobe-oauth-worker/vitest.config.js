import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'booth-text-assets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (['/src/booth-shell.js', '/src/booth-icons.js'].some((file) => importer?.endsWith(file))
        && /\/img\/(?:booth\/[^/]+|icons\/globe)\.(png|jpg|svg)$/.test(source)) {
        const type = source.endsWith('.svg') ? 'text' : 'data';
        return `${resolve(dirname(importer), source)}.booth-${type}`;
      }
      if (importer?.endsWith('/src/booth-shell.js')
        && /\/(?:booth\.html|scripts\/booth(?:-report|-presentation|-preview|-keyboard|-session)?\.js|styles\/booth(?:-report|-keyboard|-loading)?\.css|blocks\/report-(hero|stats|carousel)\/report-(hero|stats|carousel)\.(?:js|css)|blocks\/report-ai-visibility\/(?:rav-core\.js|report-ai-visibility\.css))$/.test(source)) {
        return `${resolve(dirname(importer), source)}.booth-text`;
      }
      return null;
    },
    load(id) {
      if (id.endsWith('.booth-data')) {
        const bytes = readFileSync(id.slice(0, -11));
        return `export default new Uint8Array(${JSON.stringify([...bytes])}).buffer`;
      }
      if (id.endsWith('.booth-text')) {
        return `export default ${JSON.stringify(readFileSync(id.slice(0, -11), 'utf8'))}`;
      }
      return null;
    },
  }],
  test: {
    globals: true,
    environment: 'node',
  },
});
