module.exports = {
  extends: ['./node_modules/@intabiafusion/platform-rig/profiles/ui/eslint.config.json'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json'
  }
}
