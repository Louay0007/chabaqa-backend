module.exports = {
  apps: [
    {
      name: 'chabaqa-backend',
      script: './dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Redis Configuration
        REDIS_ENABLED: 'true',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'chabaqa_redis_2024',
        REDIS_DB: 0,
        REDIS_TTL: 300,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
