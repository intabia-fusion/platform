#!/usr/bin/env bash

# Brings up the secure stand on https://localhost:8443 (mailpit on :8026): the sanity stack with the
# production sign-up checks on (tests/docker-compose.secure.yaml). Runs beside the sanity and persona
# stands. No accounts or workspaces are seeded - sign up with the code from mailpit.
#
#   ./prepare-secure.sh
#
# The certificate is made once into tests/.secure/: by mkcert when installed (trusted by the
# browser), otherwise a self-signed one the browser warns about.

set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

mkdir -p .secure
if [ ! -f .secure/cert.pem ] || [ ! -f .secure/key.pem ]; then
    if command -v mkcert >/dev/null 2>&1; then
        mkcert -cert-file .secure/cert.pem -key-file .secure/key.pem localhost 127.0.0.1 ::1
    else
        openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj '/CN=localhost' \
            -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' \
            -keyout .secure/key.pem -out .secure/cert.pem
    fi
fi

../dev/test-base/run.sh secure

# Meetings need LiveKit on the host; it is the sanity stand's instance, shared.
mkdir -p .livekit
if lsof -tiTCP:7890 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "LiveKit уже слушает порт 7890"
elif command -v livekit-server >/dev/null 2>&1; then
    nohup ./run_livekit_test.sh >.livekit/livekit.log 2>&1 &
    echo $! >.livekit/livekit.pid
    echo "LiveKit запущен, pid=$(cat .livekit/livekit.pid), лог tests/.livekit/livekit.log"
else
    echo "ВНИМАНИЕ: livekit-server не установлен, встречи работать не будут"
fi

echo
echo "Защищённый стенд готов: https://localhost:8443/login"
echo "Почта (коды входа): http://localhost:8026"
echo "Остановить: docker compose -p secure down"
