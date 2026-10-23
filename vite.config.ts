import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The application ships as one chunk of about 790 kB (220 kB gzip). The site works offline once loaded and the load time on a desktop
// connection is not materially affected, so the 500 kB warning is raised rather than splitting the Blocking and Costing workspaces
// (review decision C4, finding 6-011). Raise this limit again, or split the chunk, if the bundle grows well beyond it.
export default defineConfig({ base: './', plugins: [react()], build: { chunkSizeWarningLimit: 900 } });
