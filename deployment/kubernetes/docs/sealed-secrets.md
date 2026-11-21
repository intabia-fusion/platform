# Sealed Secrets: запечатанные секреты стендов

Локальные стенды держат тестовые секреты открыто в `stands/*/values.yaml` — они не секреты и
должны быть читаемыми. Для **реальных кластеров** (runtime `existing`/kind, общий стенд) чарты
умеют рендерить `SealedSecret` вместо обычных `Secret`: в git лежит только шифротекст, а
расшифровать его может лишь контроллер конкретного кластера.

## Как это устроено

- В `charts/platform-base` и `charts/platform` есть блок `sealedSecrets`:
  ```yaml
  sealedSecrets:
    enabled: false
    manifests: ""
  ```
- Когда `enabled: true`, обычные шаблоны Secret'ов **не рендерятся** (platform-secrets.yaml,
  секреты platform-base, livekit, postgres), а `manifests` (multi-doc YAML) применяется как есть
  через `tpl`.
- Overlay `stands/<stand>/sealed.yaml` (и `stands/base/sealed.yaml`) подхватывается
  автоматически: `stand_values_files` и `base-up.sh` добавляют его, если файл существует.
- Контроллер ставится в `base-up.sh` для не-k3d runtime, либо принудительно:
  ```bash
  SEALED_SECRETS=1 pnpm -w stand:base:up
  ```

## Установка контроллера вручную

```bash
curl -fsSL --connect-timeout 10 --max-time 180 \
  "https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.41.2/controller.yaml" \
  -o /tmp/sealed-controller.yaml
kubectl apply -f /tmp/sealed-controller.yaml
kubectl -n kube-system rollout status deployment/sealed-secrets-controller --timeout=180s
kubectl get crd sealedsecrets.bitnami.com
```

CLI для запечатывания: `brew install kubeseal` (версия должна совпадать с контроллером,
`kubeseal --version`).

## Запечатать секреты стенда

Сначала стенд должен быть задеплоен с обычными секретами — скрипт читает их из кластера:

```bash
pnpm -w stand:seal sanity      # или dev, qms, base
```

Что происходит:

1. Скрипт берёт манифест релиза (`helm get manifest`), находит все `kind: Secret`.
2. Для каждого существующего секрета делает `kubectl get secret -o yaml | kubeseal ...`
   (сертификат контроллера забирается через API, `--context` берётся из стенд-конфига).
3. Пишет overlay `stands/<stand>/sealed.yaml`:
   ```yaml
   sealedSecrets:
     enabled: true
     manifests: |
       ---
       apiVersion: bitnami.com/v1alpha1
       kind: SealedSecret
       ...
   ```

Следующий деплой подхватит overlay:

```bash
pnpm -w stand:deploy sanity --no-push
# или для base:
pnpm -w stand:base:up
```

## Проверка

```bash
kubectl -n fusion-sanity get sealedsecret
kubectl -n fusion-sanity get secret love-secret -o jsonpath='{.metadata.ownerReferences[0].kind}'   # SealedSecret
kubectl -n fusion-sanity get secret love-secret -o jsonpath='{.data.apiKey}' | base64 -d            # testkey
```

Приложение проверяется обычным коротким спеком, например:

```bash
cd tests/sanity && pnpm run uitest:k8s tests/rage-click/admin-workspaces.spec.ts
```

## Ключи и пересоздание кластера

Ключ контроллера — случайная пара при первом старте; она лежит в Secret
`sealed-secrets-key...` в `kube-system`. **Overlay действителен только для того кластера, где
запечатан.**

- Локальный k3d: `base-down`/`base-up` создаёт новый ключ → старый overlay перестаёт
  расшифровываться (SealedSecret в статусе `Unsealed=false`). Поэтому локально overlay не
  коммитим: после проверки удали `stands/<stand>/sealed.yaml` и вернись к plain.
- Общий реальный кластер: ключ стабилен, overlay можно закоммитить (он и есть смысл sealed).
  При ротации ключа контроллера секреты перезапечатываются тем же `stand:seal`.
- Сохранить ключ локального кластера между пересозданиями можно, забрав Secret
  `sealed-secrets-key...` и восстановив его в `kube-system` до старта контроллера; для
  локальных стендов это обычно не нужно.

## Вернуться к plain

```bash
rm deployment/kubernetes/stands/<stand>/sealed.yaml
kubectl -n <ns> delete sealedsecret --all      # удалит и расшифрованные Secret'ы
pnpm -w stand:deploy <stand> --no-push         # чарт отрендерит обычные Secret'ы
```

Для base — то же с `stands/base/sealed.yaml` и `pnpm -w stand:base:up`. Удаление
`SealedSecret` удаляет и созданный им `Secret`, поэтому сразу передеплой стенд.

## Ограничения

- Контроллер должен быть установлен до деплоя sealed-конфигурации, иначе поды не получат
  секреты и упадут на старте.
- Запечатанный Secret нельзя «подправить» в кластере: контроллер вернёт исходные данные.
- `helm uninstall` удаляет `SealedSecret`, а с ним и расшифрованный `Secret`; для стенда это
  нормально (данные в platform-base), для base — помни про PVC и бэкапы.
- `kubeseal` без доступа к API кластера не работает: сертификат берётся из контроллера.
