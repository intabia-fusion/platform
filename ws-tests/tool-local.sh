export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_ENDPOINT=localhost:9000
export DB_URL=postgresql://root@localhost:26257/defaultdb?sslmode=disable
export ACCOUNT_DB_URL=postgresql://root@localhost:26257/defaultdb?sslmode=disable
export ACCOUNTS_URL=http://localhost:3000
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:3333","internal":"ws://localhost:3333"}],"collaborators":[{"external":"ws://localhost:3079","internal":"ws://localhost:3079"}]}}}'
export ELASTIC_URL=http://localhost:9200
export SERVER_SECRET=secret
export QUEUE_CONFIG=localhost:19093

# Restore workspace contents in postgres/elastic
node ../dev/tool/bundle/bundle.js "$@"