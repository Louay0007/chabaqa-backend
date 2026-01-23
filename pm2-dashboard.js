const express = require('express');
const { exec } = require('child_process');
const app = express();

app.get('/', (req, res) => {
  exec('pm2 jlist', (error, stdout) => {
    if (error) {
      return res.status(500).send('Error fetching PM2 data');
    }
    
    const processes = JSON.parse(stdout);
    
    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>PM2 Dashboard - Chabaqa Backend</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: #fff; }
    h1 { color: #4CAF50; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background-color: #2d2d2d; color: #4CAF50; }
    tr:hover { background-color: #2d2d2d; }
    .status-online { color: #4CAF50; font-weight: bold; }
    .status-stopped { color: #f44336; font-weight: bold; }
    .status-errored { color: #ff9800; font-weight: bold; }
    .refresh { color: #888; font-size: 12px; }
    .btn { padding: 8px 16px; margin: 5px; background: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 4px; }
    .btn:hover { background: #45a049; }
  </style>
</head>
<body>
  <h1>🚀 PM2 Dashboard - Chabaqa Backend</h1>
  <p class="refresh">Auto-refreshes every 5 seconds</p>
  
  <table>
    <tr>
      <th>Name</th>
      <th>Status</th>
      <th>CPU</th>
      <th>Memory</th>
      <th>Uptime</th>
      <th>Restarts</th>
    </tr>
`;

    processes.forEach(proc => {
      const status = proc.pm2_env.status;
      const statusClass = status === 'online' ? 'status-online' : 
                         status === 'stopped' ? 'status-stopped' : 'status-errored';
      
      const uptime = Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000);
      const uptimeStr = uptime > 3600 ? `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m` :
                       uptime > 60 ? `${Math.floor(uptime/60)}m ${uptime%60}s` : `${uptime}s`;
      
      html += `
    <tr>
      <td>${proc.name}</td>
      <td class="${statusClass}">${status.toUpperCase()}</td>
      <td>${proc.monit.cpu}%</td>
      <td>${Math.round(proc.monit.memory / 1024 / 1024)} MB</td>
      <td>${uptimeStr}</td>
      <td>${proc.pm2_env.restart_time}</td>
    </tr>
`;
    });

    html += `
  </table>
  
  <div style="margin-top: 20px;">
    <a href="/logs"><button class="btn">📝 View Logs</button></a>
    <a href="/restart"><button class="btn">🔄 Restart All</button></a>
  </div>
</body>
</html>
`;
    
    res.send(html);
  });
});

app.get('/logs', (req, res) => {
  exec('pm2 logs chabaqa-backend --lines 100 --nostream', (error, stdout) => {
    res.send(`<pre style="background: #1a1a1a; color: #0f0; padding: 20px;">${stdout}</pre>`);
  });
});

app.get('/restart', (req, res) => {
  exec('pm2 restart all', (error, stdout) => {
    res.redirect('/');
  });
});

const PORT = 9001;
app.listen(PORT, () => {
  console.log(`✅ PM2 Dashboard running at http://51.254.132.77:${PORT}`);
});
