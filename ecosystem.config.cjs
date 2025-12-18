module.exports = {
  apps: [
    {
      name: 'zyflow-server',
      script: 'npx',
      args: 'tsx server/index.ts',
      cwd: '/Users/hansoo./ZELLYY/zyflow',

      // 재시작 설정
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // 메모리 관리
      max_memory_restart: '500M',

      // 로그 설정
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/hansoo./ZELLYY/zyflow/logs/server-error.log',
      out_file: '/Users/hansoo./ZELLYY/zyflow/logs/server-out.log',
      merge_logs: true,

      // 환경 변수
      env: {
        NODE_ENV: 'development',
      },

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'zyflow-vite',
      script: 'npx',
      args: 'vite',
      cwd: '/Users/hansoo./ZELLYY/zyflow',

      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '5s',

      // 로그 설정
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/hansoo./ZELLYY/zyflow/logs/vite-error.log',
      out_file: '/Users/hansoo./ZELLYY/zyflow/logs/vite-out.log',
      merge_logs: true,

      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'zyflow-py',
      script: 'uv',
      args: 'run python -m zyflow_agents.server',
      cwd: '/Users/hansoo./ZELLYY/zyflow/py-agents',

      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '5s',

      // 로그 설정
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/hansoo./ZELLYY/zyflow/logs/py-error.log',
      out_file: '/Users/hansoo./ZELLYY/zyflow/logs/py-out.log',
      merge_logs: true,

      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}
