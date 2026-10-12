import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*'],
      exclude: ['tests/**/*', 'src/**/*.test.ts'],
      rollupTypes: false,
      copyDtsFiles: true,
    }),
  ],

  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        components: resolve(import.meta.dirname, 'src/components/index.ts'),
        types: resolve(import.meta.dirname, 'src/types/index.ts'),
      },
      name: 'WebGLImageViewer',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'mjs' : 'cjs'
        return `${entryName}.${ext}`
      },
    },

    rolldownOptions: {
      external: ['vue', '@vue/runtime-core', '@vue/shared'],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
      },
    },

    target: 'esnext',
    minify: true,
    emptyOutDir: true,

    cssCodeSplit: false,
  },

  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },

  optimizeDeps: {
    include: ['vue'],
  },

  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
