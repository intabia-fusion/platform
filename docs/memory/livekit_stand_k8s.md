# LiveKit на k8s-стенде

Область: [Встречи](../features/office-meetings.md), стенды - [deployment/kubernetes/README.md](../../deployment/kubernetes/README.md)

- На k3d один LiveKit + один egress на все стенды живут в `platform-base`; адреса стенды берут из `ConfigMap/platform-base` (`LIVEKIT_HOST`, `LIVEKIT_PUBLIC_HOST`, `LIVEKIT_EGRESS`), не из своих values.
- Браузер на macOS и egress - разные медиа-адреса: хост достаёт сервер только по `127.0.0.1` (опубликованный порт k3d), поды - только по IP ноды (адреса подов живут в VM Docker Desktop). Поэтому сервер объявляет оба: `advertiseAddress: ""` + `loopbackCandidate: true`. С одним `--node-ip 127.0.0.1` egress-Chrome не подключается: `egress_aborted`, `Start signal not received` -> `Recording template fallback`.
- k3d публикует порт на контейнере `k3d-<cluster>-serverlb` и проксирует на ноду контейнера, поэтому `@server:0` + `hostNetwork` пода - рабочая связка (проверено UDP-эхо подом на ноде). У существующего кластера маппинги только через `k3d cluster edit --port-add`; kind - только при создании, поэтому kind/existing держат host livekit-server.
- В k3d-поде на macOS `host.docker.internal` резолвится (192.168.65.254), `host.k3d.internal` - нет.
- `Egress.ListEgress` отвечает 500 `egress not connected (redis required)`, когда у сервера нет redis: egress-воркеры находят сервер только через redis, без него `/startRecord` не работает.
- egress: `health_port` отдаёт `{"CpuLoad":N}` на `/` (годится для readinessProbe), а `template_port: 0` всё равно поднимает сервер шаблонов на `localhost:7980`.
- Записи egress попадают в бакет, который love передаёт в запросе (`<stand>`, откуда datalake их и читает); fallback `livekit.egress.s3Bucket` не используется, пока love не пришлёт свой.
- Общий сервер разделяет стенды по `projectKey` в metadata комнаты (`config.livekitProject`, `transcription-fusion-<ns>`): вебхук летит во все love, каждый чужой событие пишет `Ignoring event from different project`. События без `room.metadata` (track/egress) до фильтра не доходят и дают `no workspace client` в чужом love - безвредно.
- Из подов love и LiveKit ходят друг к другу без префикса `/_love`: маршруты сервиса - `/webhook` и `/egress-template`, префикс срезает Traefik (`Middleware strip-love`). Вебхук общего LiveKit идёт на `http://love-service.<ns>.svc.cluster.local/webhook`.
