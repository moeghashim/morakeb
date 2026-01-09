import path from 'node:path';

export function buildSystemdUnit(appDir: string, user: string, home: string): string {
  const bunBin = path.join(home, '.bun/bin/bun');
  const localBin = path.join(home, '.local/bin');
  const factoryBin = path.join(home, '.factory/bin');
  const bunDir = path.join(home, '.bun/bin');
  return `
[Unit]
Description=Morakeb URL monitor
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${appDir}
Environment=PATH=${factoryBin}:${localBin}:${bunDir}:/usr/local/bin:/usr/bin
Environment=HOME=${home}
ExecStart=${bunBin} run dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=changes

[Install]
WantedBy=multi-user.target
`.trim() + '\n';
}
