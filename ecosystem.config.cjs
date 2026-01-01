require('dotenv').config()

module.exports = {
  apps: [
    {
      name: 'zyflow-server',
      script: 'npx',
      args: 'tsx server/index.ts',
      cwd: '/Users/hansoo./ZELLYY/zyflow',
      env: {
        NODE_ENV: 'development',
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
    },
    {
      name: 'zyflow-vite',
      script: 'npx',
      args: 'vite --host',
      cwd: '/Users/hansoo./ZELLYY/zyflow',
    },
  ],
}
