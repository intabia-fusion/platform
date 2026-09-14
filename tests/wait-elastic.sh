res=''
port=$1
# The stand is on localhost for a local run and on the docker service host under docker-in-docker.
host="${ELASTIC_HOST:-localhost}"
echo "Warning Elastic to up and running with attachment processor... ${host}:${port}"
for i in `seq 1 30`;
do
  res=$(curl -s http://${host}:${port}/_cluster/health )
  echo "$res"
  if [[ $res = *"yellow"* ]]; then
    echo "Elastic up and running..."
    exit 0
  fi
  if [[ $res = *"green"* ]]; then
    echo "Elastic up and running..."
    exit 0
  fi
  sleep 1
done
# Without this the caller sees a success and the whole test phase burns its timeouts instead.
echo "Elastic did not become healthy in 30s"
exit 1
