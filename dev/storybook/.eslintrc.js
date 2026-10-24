module.exports = {
  extends: ['./node_modules/@hcengineering/platform-rig/profiles/ui/eslint.config.json'],
  parserOptions: { tsconfigRootDir: __dirname },
  // The Legacy section renders the replaced components next to the kit ones.
  rules: { 'no-restricted-imports': 'off' }
}
