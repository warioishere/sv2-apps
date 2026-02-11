# Minimal Python image for Bitcoin Core Manager
FROM python:3.11-alpine

WORKDIR /app

# Install docker CLI and su-exec (for user switching)
RUN apk add --no-cache docker-cli docker-cli-compose su-exec

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application and entrypoint
COPY app.py .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Create non-root user (entrypoint will add to docker group dynamically)
RUN addgroup -g 1000 bcmanager && \
    adduser -D -u 1000 -G bcmanager bcmanager

EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"

# Run as root initially (entrypoint needs privileges to modify groups)
# Entrypoint will switch to bcmanager user before running app
ENTRYPOINT ["/app/entrypoint.sh"]
