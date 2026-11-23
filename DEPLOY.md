# Putting Concord Tutor online

You are putting **one Node.js program** online. It serves the student app (`/`) and the admin app
(`/admin`) from the same address, over HTTPS. There is nothing to build and no `npm install` is needed.

> Prices and free-tier rules change. The notes below were checked in November 2026 — confirm on the
> provider's pricing page before you sign up.

## What you need first
- A **GitHub** account (free) – hosts connect to it to get your code.
- An account with **one** hosting provider (options below).
- A strong **admin password** (12+ characters). Anyone who knows it can see all student data.

## Step 1 – Put the code on GitHub
Unzip `Tutor.zip`, open a terminal inside the `concord-tutor` folder, then:
```bash
git init
git add .
git commit -m "Concord Tutor"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/concord-tutor.git   # create this empty repo on github.com first
git push -u origin main
```
Use a **private** repository if you can. Never upload a `data` folder or any file containing passwords.

## Step 2 – Choose where to host it

### Which option?
| Option | Cost (check current) | Keeps student data after a restart? | Best for |
|---|---|---|---|
| **A. Render – Free** | $0 | **No** – files are erased on every restart/redeploy; sleeps after 15 min idle (first visit then takes ~1 min) | Trying it out / a demo |
| **B. Railway + Volume** | small free credit, then about $5/month | **Yes** (with a Volume) | Real classes, easiest paid route |
| **C. Your own server (VPS)** | roughly €5–6/month at the cheaper providers | **Yes** | Full control, always on |

Even on the free option **students never lose their own progress** – it lives in their own browser.
What the free option loses is the *admin's record* (activity feed, who left a quiz) when it restarts.
The admin sign-in still works after a restart because it is re-created from the `ADMIN_USER` / `ADMIN_PASSWORD` variables.

### Settings every option needs
| Variable | Value | Why |
|---|---|---|
| `TRUST_PROXY` | `1` | The host handles HTTPS for you; this makes the admin cookie `Secure` and gets real visitor addresses for the login limiter |
| `ADMIN_USER` | e.g. `teacher` | Creates the admin account on first start |
| `ADMIN_PASSWORD` | your strong password | Same (only used if no admin exists yet) |
| `DATA_DIR` | path of a persistent disk (B and C) | Keeps data across restarts |
| `PORT` | *(leave it – the host sets it)* | |

Start command everywhere: **`npm start`** (health check path: `/health`).

---
### Option A – Render (free, for testing)
1. render.com → sign up with GitHub → **New → Web Service** → pick your repository.
2. **Runtime:** Node · **Build command:** `npm install` · **Start command:** `npm start` · **Instance type:** Free.
3. **Environment variables:** add `TRUST_PROXY=1`, `ADMIN_USER`, `ADMIN_PASSWORD`.
4. **Create Web Service.** After the build you get `https://your-name.onrender.com`.
5. Student app: that address · Admin app: that address + `/admin`.

To keep data on Render you must use a **paid** instance with a **Disk** (mount it at e.g. `/var/data`, then set `DATA_DIR=/var/data`). Free instances cannot attach disks.

### Option B – Railway (recommended paid route)
1. railway.com → sign up with GitHub → **New Project → Deploy from GitHub repo** → pick your repository.
2. Open the service → **Variables** → add `TRUST_PROXY=1`, `ADMIN_USER`, `ADMIN_PASSWORD`, `DATA_DIR=/data`.
3. Service → **Volumes → Add Volume**, mount path `/data`.
4. **Settings → Networking → Generate Domain** → you get an `https://….up.railway.app` address.
5. Student app: that address · Admin app: that address + `/admin`.

### Option C – Your own server (VPS)
On an Ubuntu server (point your domain's DNS A record at its IP first):
```bash
# 1. Node.js 20+ and your code
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git
sudo git clone https://github.com/YOUR-USERNAME/concord-tutor.git /opt/concord-tutor
sudo useradd -r -s /usr/sbin/nologin concord
sudo mkdir -p /var/lib/concord-tutor && sudo chown concord /var/lib/concord-tutor

# 2. Secrets file (readable only by root)
sudo tee /etc/concord-tutor.env >/dev/null <<'ENV'
ADMIN_USER=teacher
ADMIN_PASSWORD=change-me-to-a-long-passphrase
ENV
sudo chmod 600 /etc/concord-tutor.env

# 3. Run it as a service that restarts automatically
sudo tee /etc/systemd/system/concord-tutor.service >/dev/null <<'UNIT'
[Unit]
Description=Concord Tutor
After=network.target
[Service]
User=concord
WorkingDirectory=/opt/concord-tutor
Environment=PORT=3000 TRUST_PROXY=1 DATA_DIR=/var/lib/concord-tutor
EnvironmentFile=/etc/concord-tutor.env
ExecStart=/usr/bin/node server.js
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now concord-tutor
```
Then add HTTPS with **Caddy** (install it from caddyserver.com/docs/install). `/etc/caddy/Caddyfile`:
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```
`sudo systemctl reload caddy` – Caddy gets and renews the HTTPS certificate by itself.
Update later with `cd /opt/concord-tutor && sudo git pull && sudo systemctl restart concord-tutor`.

---
## Step 3 – After it is online
1. Open `https://YOUR-ADDRESS/admin` and sign in. (If you did not set `ADMIN_USER`/`ADMIN_PASSWORD`, the first-time setup code is printed in the host's **logs**.)
2. Open `https://YOUR-ADDRESS/` on a phone as a test student; watch them appear on the dashboard.
3. Install both apps (browser menu → *Install app* / *Add to Home screen*). Installing needs the `https://` address.
4. Give students only the student address. **Never share `/admin` or the admin password.**
5. Change the admin password from the dashboard once you are signed in, and delete `ADMIN_PASSWORD` from the host's variables (it is only needed for the first start).

## Good practice
- Tell students what is shared with their tutor (the name page already does). If students are under 18, make sure the school/parents agree, following your local data-protection rules.
- Back up the `DATA_DIR` folder occasionally if you rely on the activity history.
- Forgot the admin password? Run `node server.js --reset-admin` on the server (or delete the `admin.json` file in `DATA_DIR`), then restart and use the setup code or the `ADMIN_*` variables.
