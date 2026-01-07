# AI Bot Service Configuration

This document describes the configuration system for the AI Bot service, which now supports both traditional environment variables and YAML configuration files.

## Configuration Sources

The AI Bot service supports two methods for providing configuration:

1. **YAML Configuration File** (preferred)
2. **Environment Variables** (traditional method)

The configuration loading priority is:
1. YAML configuration file (if available)
2. Environment variables (fallback)

## YAML Configuration

### Method 1: File Path
Set the `CONFIG_PATH` environment variable to point to your YAML configuration file:

```bash
CONFIG_PATH=/path/to/config.yaml npm start
```

### Method 2: Inline Configuration
Set the `CONFIG_YAML` environment variable with base64-encoded YAML content:

```bash
CONFIG_YAML=$(base64 -w 0 config.yaml) npm start
```

## Configuration Schema

The YAML configuration follows this schema:

```yaml
# Account and Server Configuration
accounts:
  url: "http://huly.local:3000"  # URL of the accounts service
  serverSecret: "secret"  # Server secret for authentication
  serviceId: "ai-bot-service"  # Service identifier (default: ai-bot-service)

# Bot Identity Configuration
bot:
  firstName: "Julia"  # First name of the AI bot
  lastName: "AI"  # Last name of the AI bot
  password: "password"  # Password for the bot account (default: password)
  avatar:
    path: "./avatar.png"  # Path to avatar image (default: ./assets/avatar.png)
    name: "huly_ai_bot_avatar"  # Avatar name (default: huly_ai_bot_avatar)
    contentType: ".png"  # Avatar content type (default: image/png)

# Port Configuration
port: 4010  # Port number to run the service on (default: 4010)

# LLM (Large Language Model) Configuration
llm:
  provider: "openai"  # LLM provider type (openai, gigachat, etc.) (default: openai)
  
  # OpenAI Configuration
  openai:
    apiKey: "your-openai-api-key"  # OpenAI API key
    model: "gpt-4o-mini"  # OpenAI model to use (default: gpt-4o-mini)
    baseUrl: ""  # OpenAI base URL for custom endpoints (optional)
    translateModel: "gpt-4o-mini"  # Model for translation tasks (default: same as model)
    summaryModel: "gpt-4o-mini"  # Model for summary tasks (default: same as model)
  
  # GigaChat Configuration
  gigachat:
    credentials: "your-gigachat-credentials"  # GigaChat credentials
    scope: "GIGACHAT_API_PERS"  # GigaChat scope (default: GIGACHAT_API_PERS)
    model: "GigaChat"  # GigaChat model (default: GigaChat)
    baseUrl: "https://gigachat.devices.sberbank.ru/api/v1/"  # GigaChat base URL
    timeout: "600"  # GigaChat timeout in seconds (default: 600)

# STT (Speech-to-Text) Configuration
stt:
  provider: "openai"  # STT provider type (openai, deepgram, etc.) (default: wsr)
  url: ""  # STT API URL (optional)
  apiKey: ""  # STT API key (optional)
  model: ""  # STT model to use (optional)

# Deepgram Configuration (for STT)
deepgram:
  apiKey: ""  # Deepgram API key
  projectId: ""  # Deepgram project ID
  tag: ""  # Deepgram tag for requests (default: '')
  pollIntervalMinutes: 60  # Poll interval for transcription results (default: 60)

# VAD (Voice Activity Detection) Configuration
vad:
  rmsThreshold: 0.02  # RMS amplitude threshold for speech detection (default: 0.02)
  speechRatioThreshold: 0.1  # Speech ratio threshold (default: 0.1)

# Service Integration Configuration
services:
  love:
    endpoint: "http://huly.local:8096"  # Love service endpoint URL
  billing:
    url: "http://huly.local:4041"  # Billing service URL
  datalab:
    apiKey: ""  # DataLab API key

# Content and History Limits
limits:
  maxContentTokens: 12800  # Maximum content tokens (default: 12800)
  maxHistoryRecords: 500  # Maximum history records (default: 500)

# Debug Configuration
debug:
  dir: ""  # Directory to save debug audio files (optional)
```

## Backward Compatibility

The service remains fully backward compatible with environment variable-based configuration. If no YAML configuration is provided, the service will fall back to reading configuration from environment variables as before.

## Docker/Kubernetes Usage

### Docker Compose (Environment Variables)
```yaml
services:
  aibot:
    image: intabiafusion/ai-bot
    environment:
      # Account and Server Configuration
      - ACCOUNTS_URL=http://accounts-service:3000
      - SERVER_SECRET=your-secret
      - SERVICE_ID=ai-bot-service

      # Bot Identity Configuration
      - FIRST_NAME=AI
      - LAST_NAME=Assistant
      - PASSWORD=password
      - AVATAR_PATH=./avatar.png
      - AVATAR_CONTENT_TYPE=image/png

      # Port Configuration
      - PORT=4010

      # LLM Configuration
      - LLM_PROVIDER=openai
      - OPENAI_API_KEY=your-openai-api-key
      - OPENAI_MODEL=gpt-4o-mini
      - OPENAI_BASE_URL=  # Optional: for custom OpenAI-compatible endpoints
      - OPENAI_SUMMARY_MODEL=gpt-4o-mini
      - OPENAI_TRANSLATE_MODEL=gpt-4o-mini

      # GigaChat Configuration (only if using GigaChat)
      # - GIGACHAT_CREDENTIALS=your-gigachat-credentials
      # - GIGACHAT_SCOPE=GIGACHAT_API_PERS
      # - GIGACHAT_MODEL=GigaChat
      # - GIGACHAT_BASE_URL=https://gigachat.devices.sberbank.ru/api/v1/
      # - GIGACHAT_TIMEOUT=600

      # STT Configuration
      - STT_PROVIDER=openai  # Options: openai, deepgram
      - STT_URL=  # Optional: for custom STT endpoints
      - STT_API_KEY=your-stt-api-key
      - STT_MODEL=  # Optional: specific model to use

      # Deepgram Configuration (only if using Deepgram)
      # - DEEPGRAM_API_KEY=your-deepgram-api-key
      # - DEEPGRAM_PROJECT_ID=your-project-id
      # - DEEPGRAM_TAG=tag
      # - DEEPGRAM_POLL_INTERVAL_MINUTES=60

      # VAD Configuration
      - VAD_RMS_THRESHOLD=0.02
      - VAD_SPEECH_RATIO_THRESHOLD=0.1

      # Service Integration Configuration
      - LOVE_ENDPOINT=http://love-service:8096
      - BILLING_URL=http://billing-service:4041
      - DATALAB_API_KEY=your-datalab-api-key

      # Content and History Limits
      - MAX_CONTENT_TOKENS=12800
      - MAX_HISTORY_RECORDS=500
```

### Docker Compose (YAML Configuration File)
```yaml
services:
  aibot:
    image: intabiafusion/ai-bot
    volumes:
      - ./config.yaml:/usr/src/app/config.yaml:ro
    environment:
      - CONFIG_PATH=/usr/src/app/config.yaml
```

### Docker Compose (Inline YAML Configuration)
```yaml
services:
  aibot:
    image: intabiafusion/ai-bot
    environment:
      - CONFIG_YAML=LS0tCmFjY291bnRzOgogIHVybDogImh0dHA6Ly9hY2NvdW50cy1zZXJ2aWNlOjMwMDAiCiAgc2VydmVyU2VjcmV0OiAieW91ci1zZWNyZXQiCiAgc2VydmljZUlkOiAiYWktYm90LXNlcnZpY2UiCiMgLi4uIHJlc3Qgb2YgY29uZmlnCg==
```
(Base64 encoded YAML content)

### Kubernetes (Environment Variables)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aibot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: aibot
  template:
    metadata:
      labels:
        app: aibot
    spec:
      containers:
      - name: aibot
        image: intabiafusion/ai-bot
        ports:
        - containerPort: 4010
        env:
        - name: ACCOUNTS_URL
          value: "http://accounts-service:3000"
        - name: SERVER_SECRET
          valueFrom:
            secretKeyRef:
              name: aibot-secrets
              key: server-secret
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: aibot-secrets
              key: openai-api-key
        # Add other environment variables as needed...
```

### Kubernetes (ConfigMap)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aibot-config
data:
  config.yaml: |
    accounts:
      url: "http://accounts-service:3000"
      serverSecret: "my-secret"
    # ... rest of config
---
apiVersion: v1
kind: Secret
metadata:
  name: aibot-secrets
type: Opaque
data:
  openai-api-key: <base64-encoded-api-key>
  server-secret: <base64-encoded-secret>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aibot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: aibot
  template:
    metadata:
      labels:
        app: aibot
    spec:
      containers:
      - name: aibot
        image: intabiafusion/ai-bot
        ports:
        - containerPort: 4010
        volumeMounts:
        - name: config-volume
          mountPath: /usr/src/app/config.yaml
          subPath: config.yaml
        env:
        - name: CONFIG_PATH
          value: /usr/src/app/config.yaml
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: aibot-secrets
              key: openai-api-key
      volumes:
      - name: config-volume
        configMap:
          name: aibot-config
```
