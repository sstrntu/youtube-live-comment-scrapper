# Deployment Guide

This guide explains how to deploy the YouTube Live Comment Scraper to ytlive.turfmapp.com using Docker and Traefik.

## Prerequisites

- Docker and Docker Compose installed
- Traefik reverse proxy running with:
  - A network named `traefik`
  - Let's Encrypt configured as `letsencrypt` cert resolver
  - Entrypoint named `websecure` for HTTPS
- Cloudflare DNS configured to point ytlive.turfmapp.com to your server

## Deployment Steps

1. **Build and start the container:**
   ```bash
   docker-compose up -d --build
   ```

2. **Check logs:**
   ```bash
   docker-compose logs -f ytlive
   ```

3. **Access the application:**
   - URL: https://ytlive.turfmapp.com
   - Traefik will automatically provision an SSL certificate via Let's Encrypt

## Management Commands

- **Stop the container:**
  ```bash
  docker-compose down
  ```

- **Restart the container:**
  ```bash
  docker-compose restart
  ```

- **Rebuild and redeploy:**
  ```bash
  docker-compose up -d --build
  ```

- **View logs:**
  ```bash
  docker-compose logs -f ytlive
  ```

## Traefik Configuration

The docker-compose.yml includes these Traefik labels:
- `traefik.http.routers.ytlive.rule=Host(\`ytlive.turfmapp.com\`)` - Routes traffic from the domain
- `traefik.http.routers.ytlive.tls.certresolver=letsencrypt` - Provisions SSL certificate
- `traefik.http.services.ytlive.loadbalancer.server.port=3003` - Routes to Next.js port

## Troubleshooting

### Container not starting
```bash
docker-compose logs ytlive
```

### Traefik not routing traffic
- Verify Traefik network exists: `docker network ls | grep traefik`
- Check Traefik dashboard for the ytlive router
- Ensure DNS is propagated: `dig ytlive.turfmapp.com`

### SSL certificate issues
- Verify Traefik has Let's Encrypt configured
- Check Traefik logs: `docker logs traefik`
- Ensure port 80 and 443 are open for Let's Encrypt challenge

## Notes

- The application runs on port 3003 internally
- Traefik handles SSL termination and routing
- Container automatically restarts unless stopped
