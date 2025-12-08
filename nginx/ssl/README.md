# SSL Certificates

This directory should contain your SSL certificates for HTTPS support.

## Required files:
- `cert.pem` - SSL certificate
- `key.pem` - SSL private key

## How to add SSL:

### Option 1: Let's Encrypt (recommended for production)
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

### Option 2: Self-signed certificate (development only)
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"
```

### Enable HTTPS in nginx.conf:
After adding certificates, uncomment the HTTPS server block in `nginx/nginx.conf` (lines starting with `# server {`).

Then reload nginx:
```bash
docker exec corporate-chat-nginx nginx -s reload
```

## Security Notes:
- Never commit SSL private keys to git
- Use strong certificates in production
- Renew Let's Encrypt certificates every 90 days
- Keep private keys with 600 permissions
