# HandymanPro CRM на hostd.Canada

Комплект для конкретной машины: Contabo VPS `66.94.107.112`, SSH-порт `222`, Ubuntu,
aaPanel уже занимает :80/:443 своим nginx для чужих сайтов. Мы его обходим целиком:
приложение слушает только `127.0.0.1:3080`, наружу смотрит Cloudflare Tunnel —
исходящее соединение с этой машины к Cloudflare, публичных портов у CRM ноль.

```
  интернет ──▶ Cloudflare (crm.agintent.com, TLS) ──▶ туннель ──▶ crm:3000
                                                        │
  оператор ──▶ ssh -p 222 ──▶ curl 127.0.0.1:3080 ──────┘
```

## Файлы

| Файл | Что делает |
|---|---|
| `docker-compose.prod.yml` | Два контейнера: `handyman-crm` (loopback :3080, том `crm-var`) и `handyman-cloudflared` (туннель). Общая приватная сеть, туннель ходит на `http://crm:3000` |
| `.env.production.example` | Шаблон секретов и настроек; рабочая копия — `.env` рядом с compose-файлом на машине |
| `deploy.sh` | Деплой с рабочей станции: rsync кода → build → up → проверка `/api/health`. Идемпотентен, миграции применяет entrypoint контейнера |
| `backup-cron.sh` | Ночной снимок базы (запускает `scripts/backup.sh` внутри контейнера) плюс копия свежего снимка на диск хоста, ротация 14 суток в обоих местах |
| `healthwatch.sh` | Каждые 5 минут щупает `/api/health`; при отказе один рестарт контейнера и запись в `/var/log/handyman-healthwatch.log` |

## Первый запуск

1. **Docker на машине** (одноразово): `curl -fsSL https://get.docker.com | sh`.

2. **Туннель в Cloudflare** (одноразово): Zero Trust → Networks → Tunnels → создать
   туннель, забрать токен. Public hostnames:
   - `crm.agintent.com` → `http://crm:3000`
   - `*.crm.agintent.com` → `http://crm:3000` — рабочие пространства живут на
     поддоменах, wildcard обязателен (для wildcard-имени в зоне agintent.com нужна
     CNAME-запись `*.crm` на `<tunnel-id>.cfargotunnel.com`).

3. **Первый прогон деплоя** с рабочей станции:
   ```bash
   deploy/hostd/deploy.sh
   ```
   Он зальёт код и остановится с инструкцией: на машине создать
   `/opt/handyman-crm/deploy/hostd/.env` из `.env.production.example`, вписать
   `NEXTAUTH_SECRET`, `MAILGUN_WEBHOOK_SIGNING_KEY` (тот же ключ, что
   у почтового воркера). Затем запустить `deploy.sh` ещё раз — он соберёт образ,
   поднимет оба контейнера и покажет ответ `/api/health`.

4. **Кроны на машине** (root, `crontab -e`):
   ```cron
   15 3 * * *  /opt/handyman-crm/deploy/hostd/backup-cron.sh >> /var/log/handyman-backup.log 2>&1
   */5 * * * * /opt/handyman-crm/deploy/hostd/healthwatch.sh
   ```
   Права на скрипты приезжают вместе с rsync; если cron жалуется —
   `chmod +x /opt/handyman-crm/deploy/hostd/*.sh`.

## Обновление версии

Тот же `deploy/hostd/deploy.sh` с рабочей станции. Перед крупным обновлением — снимок
руками: `ssh -p 222 root@66.94.107.112 docker exec handyman-crm /app/scripts/backup.sh`.
Откат: `git checkout <прошлый коммит>` локально и снова `deploy.sh`.

## Бэкапы и учение по восстановлению

Снимки лежат в двух местах: внутри тома (`/app/var/backups`, ротация `BACKUP_KEEP=14`)
и на диске хоста (`/var/backups/handyman-crm`, те же 14 суток). Копию с машины наружу
(rclone/scp на третий носитель) стоит добавить, когда база станет ценной — диск одного
VPS считается одной точкой отказа.

**Учение раз в месяц.** Восстановление, которое ни разу не прогоняли, — предположение.
Прогон честный, на этой же машине, занимает пять минут:

```bash
ssh -p 222 root@66.94.107.112
cd /opt/handyman-crm

docker compose -f deploy/hostd/docker-compose.prod.yml stop crm
docker compose -f deploy/hostd/docker-compose.prod.yml run --rm \
  --entrypoint /app/scripts/restore.sh crm --latest        # спросит слово RESTORE
docker compose -f deploy/hostd/docker-compose.prod.yml start crm
curl -s http://127.0.0.1:3080/api/health                   # {"status":"ok",...}
```

`restore.sh` перед заменой сам снимает копию текущей базы (`pre-restore-*.db.gz`), так
что учение обратимо. После проверки приложения файлы `crm.db.replaced-*` и
`pre-restore-*` удаляются руками. Дата последнего учения — в
`/app/var/backups/backup.log` (строки `restore:`).

## Диагностика

```bash
ssh -p 222 root@66.94.107.112
curl -s http://127.0.0.1:3080/api/health        # что видит watchdog
cd /opt/handyman-crm
docker compose -f deploy/hostd/docker-compose.prod.yml ps
docker compose -f deploy/hostd/docker-compose.prod.yml logs --tail=100 crm
docker logs --tail=50 handyman-cloudflared      # состояние туннеля
tail -20 /var/log/handyman-healthwatch.log
tail -20 /var/log/handyman-backup.log
```

Локально health отвечает, а снаружи 502/530 — смотреть туннель: `docker logs
handyman-cloudflared` и статус туннеля в Zero Trust. Расшифровка кодов `/api/health` —
таблица «Диагностика» в корневом `DEPLOY.md`.
