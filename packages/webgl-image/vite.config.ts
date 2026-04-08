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
        index: resolve(__dirname, 'src/index.ts'),
        components: resolve(__dirname, 'src/components/index.ts'),
        types: resolve(__dirname, 'src/types/index.ts'),
      },
      name: 'WebGLImageViewer',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'mjs' : 'cjs'
        return `${entryName}.${ext}`
      },
    },

    rollupOptions: {
      external: ['vue', '@vue/runtime-core', '@vue/shared'],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
        inlineDynamicImports: false,
        manualChunks: undefined,
      },
    },

    target: 'esnext',
    minify: true,
    emptyOutDir: true,

    cssCodeSplit: false,
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  optimizeDeps: {
    include: ['vue'],
  },

  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
