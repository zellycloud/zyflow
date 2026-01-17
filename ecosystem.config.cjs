require('dotenv').config()
const path = require('path')
const os = require('os')

const CWD = '/Users/hansoo./ZELLYY/zyflow'

// Common settings for all server instances
const commonServerSettings = {
  script: 'npx',
  args: 'tsx server/index.ts',
  cwd: CWD,
  max_memory_restart: '512M',
  restart_delay: 5000,
  max_restarts: 10,
  min_uptime: 10000,
  kill_timeout: 10000,
}

module.exports = {
  apps: [
    // ========================================
    // ZyFlow - Personal Instance (개인용)
    // Frontend: 3100, API: 3101
    // ========================================
    {
      ...commonServerSettings,
      name: 'zyflow-server',
      env: {
        NODE_ENV: 'development',
        INSTANCE_NAME: 'zyflow',
        INSTANCE_DISPLAY_NAME: 'ZyFlow',
        PORT: 3101,
        DATA_DIR: path.join(os.homedir(), '.zyflow'),
        DEFAULT_PROJECT_ROOT: path.join(os.homedir(), 'ZELLYY'),
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
      env_production: {
        NODE_ENV: 'production',
        INSTANCE_NAME: 'zyflow',
        INSTANCE_DISPLAY_NAME: 'ZyFlow',
        PORT: 3101,
        DATA_DIR: path.join(os.homedir(), '.zyflow'),
        DEFAULT_PROJECT_ROOT: path.join(os.homedir(), 'ZELLYY'),
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
    },
    {
      name: 'zyflow-vite',
      script: 'npx',
      args: 'vite --host --port 3100',
      cwd: CWD,
    },

    // ========================================
    // _Flow - Work Instance (회사용)
    // Frontend: 3200, API: 3201
    // ========================================
    {
      ...commonServerSettings,
      name: '_flow-server',
      env: {
        NODE_ENV: 'development',
        INSTANCE_NAME: '_flow',
        INSTANCE_DISPLAY_NAME: '_Flow',
        PORT: 3201,
        DATA_DIR: path.join(os.homedir(), '._flow'),
        DEFAULT_PROJECT_ROOT: path.join(os.homedir(), 'JAYOO'),
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
      env_production: {
        NODE_ENV: 'production',
        INSTANCE_NAME: '_flow',
        INSTANCE_DISPLAY_NAME: '_Flow',
        PORT: 3201,
        DATA_DIR: path.join(os.homedir(), '._flow'),
        DEFAULT_PROJECT_ROOT: path.join(os.homedir(), 'JAYOO'),
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
    },
    {
      name: '_flow-vite',
      script: 'npx',
      args: 'vite --host --port 3200',
      cwd: CWD,
    },
  ],
}
