require('dotenv').config()

module.exports = {
  apps: [
    {
      name: 'zyflow-server',
      script: 'npx',
      args: 'tsx server/index.ts',
      cwd: '/Users/hansoo./ZELLYY/zyflow',
      // 안정성 설정
      max_memory_restart: '512M',    // 메모리 512MB 초과 시 재시작
      restart_delay: 5000,           // 재시작 전 5초 대기
      max_restarts: 10,              // 최대 10번 재시작
      min_uptime: 10000,             // 10초 이상 실행되어야 정상
      kill_timeout: 10000,           // 종료 대기 시간
      // 환경 설정
      env: {
        NODE_ENV: 'development',
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      },
      env_production: {
        NODE_ENV: 'production',
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
