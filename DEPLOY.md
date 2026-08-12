# Развёртывание HandymanPro CRM

От чистого VPS до рабочего адреса с HTTPS. Дорога занимает около сорока минут, из них
двадцать — сборка образа.

---

## Из чего состоит установка

```
                 :443
  интернет ──▶ Caddy (TLS, wildcard) ──▶ 127.0.0.1:3000 ──▶ контейнер handyman-crm
                                                                   │
                                                          том crm-var (/app/var)
                                                          ├── crm.db      база
                                                          ├── uploads/    фото работ
                                                          └── backups/    снимки базы
```

Контейнер держит только код. Всё, что переживает пересборку, лежит на именованном томе.
База — SQLite: работает ровно один контейнер на один файл базы, горизонтального
масштабирования тут нет и не планируется.

Адреса устроены так: `handymanpro.ca` и `www.handymanpro.ca` показывают вход и
регистрацию, `<слаг>.handymanpro.ca` — рабочее пространство конторы. Слаг читается из
первой метки адреса (`src/lib/tenant-slug.ts`), поэтому домен CRM выделяется под неё
целиком.

---

## Что нужно заранее

- VPS: 2 vCPU, 2 ГБ RAM, 20 ГБ диска. Ubuntu 24.04 LTS.
- Домен с доступом к DNS. Для wildcard-сертификата понадобится API-токен DNS-провайдера.
- Порты 80 и 443 открыты наружу, 22 — с ваших адресов.

---

## Шаг 1. Сервер

```bash
ssh root@<ip>

adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

# вход по паролю выключаем
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

apt update && apt upgrade -y
apt install -y ufw git curl
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# swap: сборка Next.js на 2 ГБ RAM без него упирается в OOM
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Шаг 2. Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable --now docker
```

Дальше всё делается от пользователя `deploy`.

## Шаг 3. Код

```bash
sudo -iu deploy
git clone <адрес репозитория> /opt/handyman-crm
cd /opt/handyman-crm
```

## Шаг 4. Переменные окружения

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32      # значение для NEXTAUTH_SECRET
nano .env
```

Обязательные — без них `docker compose up` остановится с ошибкой ещё до запуска
контейнера:

| Переменная | Значение | Комментарий |
|---|---|---|
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Подпись сессий. Смена значения разлогинивает всех |
| `NEXTAUTH_URL` | `https://handymanpro.ca` | Публичный адрес. Вход на поддомене работает: форма шлёт `signIn(..., redirect: false)` и остаётся на своём хосте |

Управляют поведением:

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `APP_PORT` | `3000` | Локальный порт, к которому подключается прокси |
| `SELF_SERVE_SIGNUP` | пусто | Публичная форма `/register`. Пустое значение на боевом хосте держит её **закрытой**: посторонний иначе заводит рабочее пространство на домене подрядчика. `on` включает публичные триалы |
| `TRUSTED_PROXY_HOPS` | `1` | Сколько прокси стоит перед приложением. Адрес клиента для тротлинга читается из `X-Forwarded-For` **справа**: левая часть заголовка — то, что прислал сам вызывающий, и чтение её оттуда снимает ограничение на подбор пароля. Единица соответствует одному Caddy из этого документа; CDN перед ним делает значение двойкой |
| `SUPER_ADMIN_EMAILS` | пусто | Адреса операторов платформы через запятую |
| `PLATFORM_TENANT_SLUG` | пусто | Слаг рабочего пространства платформы. **Пустое значение выключает супер-админку целиком** — панель отвечает 401 всем, включая адреса из списка выше. Так и должно быть, пока платформенное пространство не создано |
| `TRIAL_DAYS` | `7` | Длина демо-периода при саморегистрации |
| `LEAD_DEDUP_DAYS` | `30` | Окно, внутри которого повторное обращение с того же адреса считается тем же лидом |
| `MAX_UPLOAD_MB` | `12` | Предел на один файл фото |
| `MAX_PHOTOS_PER_JOB` | `40` | Предел на работу |
| `BACKUP_KEEP` | `14` | Сколько ночных снимков базы остаётся в `var/backups` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `support@handymanpro.ca` | Адрес на кнопке «Upgrade». Значение вшивается в клиентский бандл на сборке, поэтому его смена требует `docker compose build` |

Интеграции. Каждая молчит, пока её ключи пусты, и включается их появлением:

| Переменная | Что ломается без неё |
|---|---|
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Почтовый вебхук отклоняет все входящие письма. Поведение сознательное: без ключа подпись проверить нечем, и раньше вебхук в этом состоянии принимал выдуманные лиды от кого угодно |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Лиды Facebook и Instagram не принимаются |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Local Services Ads отключены |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Исходящая почта (сметы, счета, напоминания) не уходит |

`DATABASE_URL` в `.env` для сервера не пишется: контейнер всегда получает
`file:/app/var/crm.db` из `docker-compose.yml`. Точка внутри `/app/var` проверяется на
старте, попытка увести базу в другое место останавливает контейнер.

## Шаг 5. Сборка и запуск

```bash
docker compose build          # 10–20 минут: better-sqlite3 собирается из исходников
                              # готовый образ ~680 МБ
docker compose up -d
docker compose logs -f crm    # ожидаем «applying migrations» и «starting Next.js»
```

Проверка:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","migrations":8}
```

Миграции применяются на старте контейнера (`prisma migrate deploy`). Их неудача
останавливает запуск: наполовину мигрированная схема хуже отсутствия сервиса.

## Шаг 6. DNS

| Тип | Имя | Значение |
|---|---|---|
| A | `@` | `<ip сервера>` |
| A | `www` | `<ip сервера>` |
| A | `*` | `<ip сервера>` |

Wildcard-запись обязательна: каждая контора живёт на своём поддомене, и они заводятся
без участия админа сервера.

## Шаг 7. HTTPS и обратный прокси

Wildcard-сертификат Let's Encrypt выдаёт только через проверку DNS-01, поэтому Caddy
берётся в сборке с плагином провайдера. Пример для Cloudflare:

```bash
mkdir -p /opt/caddy && cd /opt/caddy
```

`/opt/caddy/Dockerfile`:

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare
FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

`/opt/caddy/Caddyfile`:

```caddyfile
{
    email admin@handymanpro.ca
}

handymanpro.ca, www.handymanpro.ca, *.handymanpro.ca {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }

    encode zstd gzip
    request_body {
        max_size 15MB          # чуть выше MAX_UPLOAD_MB, иначе фото с телефона обрежется
    }

    # Заголовок перезаписывается целиком. Caddy по умолчанию ДОПИСЫВАЕТ адрес в конец
    # X-Forwarded-For, и всё, что прислал клиент, остаётся в заголовке. Приложение
    # считает адрес справа (TRUSTED_PROXY_HOPS=1), поэтому подделка не проходит, но
    # с этой строкой в заголовке остаётся ровно один адрес — тот, который видел прокси.
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}
    }

    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

`/opt/caddy/docker-compose.yml`:

```yaml
services:
  caddy:
    build: .
    restart: unless-stopped
    network_mode: host
    environment:
      CF_API_TOKEN: ${CF_API_TOKEN:?токен с правами Zone:DNS:Edit}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
      - /var/log/caddy:/var/log/caddy
volumes:
  caddy-data:
  caddy-config:
```

```bash
echo "CF_API_TOKEN=<токен>" > /opt/caddy/.env && chmod 600 /opt/caddy/.env
docker compose up -d
curl -sI https://handymanpro.ca/api/health | head -1
```

Провайдер DNS другой — меняется только имя плагина в `xcaddy build` и блок `dns`
(`caddy-dns/route53`, `caddy-dns/namecheap` и так далее). Токен даётся с правами на одну
зону.

Запасной путь без wildcard: убрать `*.handymanpro.ca` из адресов и включить
`on_demand_tls` — Caddy выпустит отдельный сертификат на каждый поддомен при первом
обращении. Ограничение Let's Encrypt в 50 сертификатов на домен в неделю при таком
режиме достигается быстро, поэтому wildcard остаётся основным вариантом.

## Шаг 8. Первый вход

1. Открыть `https://handymanpro.ca/register`, завести рабочее пространство платформы,
   например со слагом `hq` и почтой оператора.
2. Вписать в `.env`:
   ```
   SUPER_ADMIN_EMAILS="operator@handymanpro.ca"
   PLATFORM_TENANT_SLUG="hq"
   ```
3. `docker compose up -d` — контейнер перезапустится с новыми переменными.
4. Панель платформы: `https://hq.handymanpro.ca/admin`.

Супер-админом считается администратор пространства `PLATFORM_TENANT_SLUG`, чья почта
есть в списке. Регистрация чужого пространства на тот же адрес прав не даёт.

---

## Бэкапы

Снимок снимается средствами самой SQLite (`.backup`) и проверяется через
`PRAGMA integrity_check`. Копирование файла базы через `cp` на живой системе даёт рваную
копию: свежие страницы в этот момент лежат в WAL-файле рядом.

Ежедневно в 03:15, `crontab -e` от пользователя `deploy`:

```cron
15 3 * * * cd /opt/handyman-crm && docker compose exec -T crm /app/scripts/backup.sh >> /var/log/crm-backup.log 2>&1
```

Скрипт кладёт снимки в `/app/var/backups` внутри тома, держит последние `BACKUP_KEEP`
штук (по умолчанию 14) и возвращает ненулевой код при любой неудаче, так что cron
пришлёт письмо. Журнал операций дублируется в `var/backups/backup.log`.

Хранить бэкапы только на том же диске означает не иметь бэкапов. Копия наружу, в 04:00:

```cron
0 4 * * * docker run --rm -v handyman-crm_crm-var:/v:ro -v /home/deploy/offsite:/out alpine \
          sh -c 'cp /v/backups/crm-*.db.gz /out/' && rclone sync /home/deploy/offsite remote:crm-backups
```

Раз в месяц копия разворачивается на тестовой машине и открывается приложением.
Восстановление, которое ни разу не пробовали, — это предположение.

Снять снимок при остановленном контейнере:

```bash
docker run --rm -v handyman-crm_crm-var:/app/var \
  -e DATABASE_URL=file:/app/var/crm.db \
  --entrypoint /app/scripts/backup.sh handyman-crm:latest
```

---

## Обновление версии

```bash
cd /opt/handyman-crm
docker compose exec -T crm /app/scripts/backup.sh    # снимок до изменений
git pull
docker compose build
docker compose up -d
curl -s http://127.0.0.1:3000/api/health
docker compose logs --tail=50 crm
```

Откат: `git checkout <предыдущий коммит>`, повторить сборку. База при откате кода
остаётся мигрированной вперёд — если новая версия добавляла столбцы, старый код с ними
уживается, а обратная миграция делается только через восстановление из снимка.

---

## Диагностика

`GET /api/health` открыт без авторизации и отвечает 200 только тогда, когда база
отвечает на запрос и все миграции из образа применены.

| Ответ | Что произошло | Что делать |
|---|---|---|
| `{"status":"ok","migrations":N}` | Всё работает | — |
| `503 database_unreachable` | Том не смонтирован, файл базы удалён или диск заполнен | `docker compose exec crm ls -la /app/var`, `df -h`, `docker volume inspect handyman-crm_crm-var` |
| `503 migration_journal_missing` | База пустая или подключена не та | Проверить `DATABASE_URL` и содержимое тома |
| `503 migration_failed` | Миграция начата и не завершена (P3009) | `docker compose logs crm`, дальше `prisma migrate resolve` либо восстановление из снимка |
| `503 migration_pending` | Образ новее базы: миграции не применились на старте | `docker compose logs crm` — причина в блоке «applying migrations» |
| `503 migration_folder_unreadable` | Повреждён образ, папка `prisma/migrations` не доехала | Пересобрать образ |

Полезные команды:

```bash
docker compose ps                     # STATUS содержит health
docker compose logs --tail=200 crm
docker stats --no-stream
df -h /var/lib/docker
docker compose exec crm ls -la /app/var
```

Контейнер перезапускается по кругу — смотреть первые строки лога: entrypoint печатает,
какой именно переменной окружения не хватает.

Сайт отдаёт 502 — жив ли контейнер (`docker compose ps`) и слушает ли он порт
(`curl 127.0.0.1:3000/api/health`). Ответ есть, а снаружи 502 — дело в Caddy
(`docker logs caddy-caddy-1`).

Диск заполнен — чистить в первую очередь образы (`docker image prune -a`) и старые логи
(`journalctl --vacuum-time=7d`). Том с базой трогать в последнюю очередь.

---

## Восстановление из бэкапа

Останавливать приложение обязательно: открытое соединение продолжит писать в файл,
который вот-вот заменят.

```bash
cd /opt/handyman-crm
docker compose stop crm

# посмотреть, что есть
docker run --rm -v handyman-crm_crm-var:/v:ro alpine ls -lt /v/backups

# развернуть последний снимок (скрипт спросит подтверждение словом RESTORE)
docker compose run --rm --entrypoint /app/scripts/restore.sh crm --latest
# либо конкретный: ... restore.sh /app/var/backups/crm-20260812-031501.db.gz

docker compose start crm
curl -s http://127.0.0.1:3000/api/health
```

Что делает `restore.sh`, прежде чем что-либо заменить:

1. распаковывает снимок и проверяет его через `PRAGMA integrity_check` — повреждённый
   файл отклоняется, рабочая база остаётся нетронутой;
2. снимает копию текущей базы в `var/backups/pre-restore-<метка>.db.gz`;
3. отодвигает текущий файл в `crm.db.replaced-<метка>` и удаляет `-wal` и `-shm`.
   Забытый WAL от старой базы читается как её хвост и портит восстановленный файл;
4. кладёт снимок на место и проверяет его ещё раз, уже на месте.

Файлы `*.replaced-*` и `pre-restore-*.db.gz` остаются лежать намеренно и удаляются руками
после того, как приложение проверено: ротация их не трогает.

Восстановление на другую машину: перенести `crm-*.db.gz`, поднять там стек по этой же
инструкции и запустить `restore.sh` до первого старта приложения.

---

## Границы конструкции

- Один контейнер на одну базу. Второй экземпляр рядом с тем же файлом ломает и данные,
  и счётчик попыток входа, который живёт в памяти процесса.
- Фото работ лежат на том же томе. Объём растёт быстрее базы, за `df -h` стоит следить.
- `next start` со сборкой `output: "standalone"` не работает. В контейнере запуск идёт
  через `node server.js` в `docker-entrypoint.sh`; вне контейнера то же самое делает
  `npm start` (`scripts/start-standalone.sh` — он же докладывает статику и `public/`,
  которых в самом бандле нет). Менять это место без нужды не стоит.
- Смена `NEXTAUTH_SECRET` разлогинивает всех пользователей всех контор разом.
