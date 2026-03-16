/**
 * PM2 ecosystem config for Multiplayer Browser server
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [{
    name: 'multiplayer-browser',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 4001,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
  }],
};
