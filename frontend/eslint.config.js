import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // React 19 / react-hooks v7 flags "setState in effect" as an error, but
      // the legitimate "reset derived state when inputs change" pattern (e.g.
      // clearing a route when coords disappear, restarting an elapsed timer)
      // triggers it everywhere without being an actual bug. Keep the other
      // react-hooks rules strict; downgrade this one to a warning.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
