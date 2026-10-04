import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'booth-text-assets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.endsWith('/src/booth-shell.js')
        && /\/(?:booth\.html|scripts\/booth(?:-report|-presentation)?\.js|styles\/booth(?:-report)?\.css)$/.test(source)) {
        return `${resolve(dirname(importer), source)}.booth-text`;
      }
      return null;
    },
    load(id) {
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
