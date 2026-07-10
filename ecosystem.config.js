module.exports = {
  apps: [
    {
      name: 'telegram-referral-bot',
      script: 'src/server.js',
      
      // RUNNING INSTANCES WARNING:
      // In webhook mode, you can scale to multiple instances (instances: 'max').
      // In polling mode, you MUST run exactly 1 instance to avoid duplicate message processing.
      instances: 'max',
      exec_mode: 'cluster', // change to 'cluster' only in webhook mode
      
      watch: false,
      max_memory_restart: '300M',
      
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      autorestart: true,
    },
  ],
};
