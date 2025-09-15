Deployment on EC2 (Ubuntu) – Backend

Overview
- Node.js Express API on port 3000
- Reads 67MB Parquet from repo at data/data_full.parquet (committed intentionally)
- Managed via systemd: vd-backend.service
- Reverse-proxied by Nginx from /api (configured by the frontend deploy)

One-time EC2 bootstrap
1) SSH to instance and install basics
   - sudo apt-get update -y && sudo apt-get install -y git nginx
   - Install Node.js 20: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
2) Ensure firewall allows HTTP
   - sudo ufw allow OpenSSH
   - sudo ufw allow 80/tcp
   - sudo ufw enable

GitHub Secrets required (in vd-backend repo)
- EC2_HOST: public IP or DNS
- EC2_USER: ubuntu
- EC2_SSH_PORT: 22 (or custom)
- EC2_SSH_KEY: contents of private key (PEM) with access to the instance

CI/CD behavior
- On push to main, GitHub Action connects via SSH to the EC2 host, clones/updates /opt/vd-backend, runs npm ci && npm run build, writes a secure env file at /etc/vd-backend.env, and restarts the systemd service.

Environment (systemd environment file)
- Location: /etc/vd-backend.env (root-owned 600)
- Example values:
   - PORT=3000
   - CORS_ORIGIN=https://democracy-dashboard.com
   - OPENAI_API_KEY=... (set via GitHub Secret in workflow)

Logs
- /var/log/vd-backend.log and /var/log/vd-backend.err
