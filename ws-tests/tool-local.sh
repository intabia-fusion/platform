export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_ENDPOINT=huly.local:9000
export MONGO_URL=mongodb://huly.local:27017
export DB_URL=mongodb://huly.local:27017
export ACCOUNT_DB_URL=postgresql://root@huly.local:26257/defaultdb?sslmode=disable
export ACCOUNTS_URL=http://huly.local:3000
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://huly.local:3333","internal":"ws://huly.local:3333"}],"collaborators":[{"external":"ws://huly.local:3079","internal":"ws://huly.local:3079"}]}}}'
export ELASTIC_URL=http://huly.local:9200
export SERVER_SECRET=secret
export QUEUE_CONFIG=huly.local:19093

# Restore workspace contents in mongo/elastic
node ../dev/tool/bundle/bundle.js "$@"