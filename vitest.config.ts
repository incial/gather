import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Same `@/` import alias as the app (tsconfig paths), so tests can load API route files.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
