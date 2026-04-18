module.exports = {
  extends: ['./node_modules/@intabiafusion/platform-rig/profiles/default/eslint.config.json'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json'
  }
}
