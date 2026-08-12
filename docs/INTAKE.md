# Приём лидов с лендинга

Квиз на сайте подрядчика отправляет заявку прямо в CRM: лид появляется в разделе
**Leads** со статусом NEW, ответы квиза лежат в карточке текстом.

Канал открывается ключом. Ключ живёт в адресе:

```
POST https://<воркспейс>.<домен>/api/intake/<ключ>
Content-Type: application/json
```

Тенант определяется ключом. Поле `tenantId` в теле игнорируется всегда.

---

## Шаг 1. Завести ключ

CRM → **Settings → Landing intake** (`/settings/intake`), кнопка **New key**.

- **Channel name** — имя канала. Оно становится первой строкой заметки в карточке лида,
  поэтому пишите так, как узнаете его через полгода: «Korvex renovation quiz».
- **Counts as source** — под каким источником считать эти лиды в статистике
  (`FACEBOOK` для трафика с Меты, иначе `OTHER`).

Готовый URL показывается **один раз**, сразу после создания. В базе хранится только
sha256-хэш ключа: восстановить его нельзя, потерянный ключ заменяется новым.

Страница показывает, когда канал последний раз приносил лида. Строка «no leads yet»
через неделю после запуска рекламы означает, что цепочка где-то рвётся.

Раздел доступен владельцу (роль ADMIN). Бригада ключи не видит.

---

## Шаг 2. Форма запроса

Обязательное: `name` и хотя бы один контакт — `phone` либо `email`.

Всё остальное складывается в заметку лида парами «вопрос → ответ» в том порядке, в
котором ключи идут в JSON. Ключи обоих живых квизов подписаны по-человечески
(`q_from` → «Moving from», `service` → «Service», `budget` → «Budget»); незнакомый ключ
превращается в подпись автоматически (`garage_door_width` → «Garage door width»).

Отдельно разбираются:

| Поле | Куда попадает |
|---|---|
| `name`, `full_name` | имя лида |
| `phone`, `phone_e164` | телефон |
| `email` | почта (проверяется на форму адреса) |
| `address`, `street`, `city` | адрес и город в карточке |
| `service`, `job_type` | тип работы |
| `event_id` | идентификатор отправки, по нему ловятся повторы |
| `fbp`, `fbc`, `user_agent`, `ip`, `ts`, `test_event_code` | отбрасываются как рекламный шум |

Пример полезной нагрузки квиза Korvex:

```json
{
  "event_id": "lead_1786602222_42",
  "name": "Оксана Левчук",
  "phone": "613-555-0466",
  "email": "oksana.levchuk@gmail.com",
  "service": "Basement finishing",
  "scope": "Framing, drywall, floor",
  "property": "Semi-detached",
  "timing": "ASAP",
  "budget": "$15,000 - $25,000",
  "area": "Nepean",
  "contact_pref": "Phone call",
  "page": "https://korvex.mmix.ca/"
}
```

Так это выглядит в карточке лида:

```
Korvex renovation quiz

Service: Basement finishing
Scope of work: Framing, drywall, floor
Property type: Semi-detached
Timing: ASAP
Budget: $15,000 - $25,000
Area: Nepean
Prefers contact by: Phone call
Page: https://korvex.mmix.ca/
```

### Ответы

| Код | Тело | Когда |
|---|---|---|
| 201 | `{"ok":true}` | лид создан |
| 200 | `{"ok":true,"deduped":true}` | повтор в пределах окна дедупа |
| 400 | `{"ok":false,"error":"Expected JSON"}` | тело не разобралось |
| 404 | `{"ok":false,"error":"Unknown intake key"}` | ключ выдуман либо отозван |
| 413 | `{"ok":false,"error":"Payload too large"}` | тело больше 20 КБ |
| 422 | `{"ok":false,"error":"phone or email is required"}` | нет имени или контакта |
| 429 | `{"ok":false,"error":"Too many submissions"}` | троттлинг, есть заголовок `Retry-After` |
| 500 | `{"ok":false,"error":"Intake unavailable"}` | наша поломка, подробности остаются в логе сервера |

Ответ приходит всегда JSON-ом. Лендинг вправе игнорировать его целиком: клиент видит
экран благодарности независимо от того, доехал ли лид до CRM.

### Дедуп

Повторная отправка той же формы за минуту даёт один лид. Работают две проверки:

1. Совпадение `event_id` в пределах воркспейса — так гасятся повторы, которые квиз шлёт
   сам (Beaver Movers складывает неудачные отправки в localStorage и досылает их позже).
2. Совпадение телефона или почты за последние `LEAD_DEDUP_DAYS` дней (по умолчанию 30).
   Телефон сравнивается по цифрам, поэтому `613-555-0466` и `+16135550466` считаются
   одним человеком.

Тот же заказчик через полгода попадёт в CRM новым лидом.

### Троттлинг

- 10 отправок с одного IP за 10 минут;
- 60 отправок по одному ключу за час.

Лендинг под рекламой ловит ботов вместе с людьми, поэтому лимиты стоят по обеим осям.
Счётчик живёт в памяти процесса и обнуляется при перезапуске.

---

## Шаг 3. Подключить лендинг

### Вариант A (рабочий) — форвард из `send_lead.php`

Ключ остаётся на сервере лендинга и в исходный код страницы не попадает.

Кусок ставится **после** блоков Telegram и Meta CAPI, перед финальным `echo`. Ответ CRM
игнорируется, таймаут короткий: доставка в CRM не должна влиять на уже отработавшую
цепочку «jsonl → Telegram → CAPI».

**Korvex** (`$lead` там уже собран выше по файлу):

```php
/* ── HandymanPro CRM ── */
const CRM_INTAKE_URL = 'https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ';

$crm = $lead;
unset($crm['ip'], $crm['ua'], $crm['ts']);   // в CRM это шум

$ch = curl_init(CRM_INTAKE_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 4,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($crm, JSON_UNESCAPED_UNICODE),
]);
@curl_exec($ch);
curl_close($ch);
```

**Beaver Movers** (там переменные лежат по отдельности):

```php
/* ── HandymanPro CRM ── */
const CRM_INTAKE_URL = 'https://beavermovers.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ';

$crm = [
    'event_id'   => $event['event_id'],
    'name'       => $name,
    'phone'      => $phoneRaw,
    'phone_e164' => $phoneE164,
    'q_from'     => $q_from,
    'q_to'       => $q_to,
    'q_when'     => $q_when,
    'q_size'     => $q_size,
    'q_packing'  => $q_packing,
    'q_heavy'    => $q_heavy,
    'page'       => $eventUrl,
];

$ch = curl_init(CRM_INTAKE_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 4,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($crm, JSON_UNESCAPED_UNICODE),
]);
@curl_exec($ch);
curl_close($ch);
```

Ключ подставляется на сервере при деплое, как уже сделано с `TG_TOKEN` и `CAPI_TOKEN`.
В репозиторий он не коммитится.

### Вариант B — прямой POST из браузера

Годится для лендинга без бэкенда. Эндпоинт отвечает на preflight и разрешает
кросс-доменный POST.

```js
fetch('https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}).catch(function () { /* экран благодарности показываем в любом случае */ });
```

Цена варианта: ключ виден в исходном коде страницы, и любой желающий сможет слать
заявки от имени этого канала. Защита — троттлинг и кнопка отзыва: заспамленный ключ
удаляется на `/settings/intake`, на его место выпускается новый. Для клиентов с рекламным
бюджетом берите вариант A.

---

## Шаг 4. Проверить канал curl-ом

Живой ключ:

```bash
curl -i -X POST https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ \
  -H 'Content-Type: application/json' \
  -d '{"name":"Curl Probe","phone":"613-555-0000","service":"Test"}'
```

Ожидаем `201` и `{"ok":true}`. Лид появляется в **Leads** сразу, на `/settings/intake`
обновляется строка «last lead today».

Повтор той же команды в течение 30 дней вернёт `200 {"ok":true,"deduped":true}` —
дедуп работает.

Выдуманный ключ:

```bash
curl -i -X POST https://korvex.crm.example.com/api/intake/wo_nope \
  -H 'Content-Type: application/json' -d '{"name":"X","phone":"1"}'
# 404 {"ok":false,"error":"Unknown intake key"}
```

Заявка без контакта:

```bash
curl -i -X POST https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ \
  -H 'Content-Type: application/json' -d '{"name":"Ghost"}'
# 422 {"ok":false,"error":"phone or email is required"}
```

Тестовый лид потом удаляется из карточки лида в CRM.

---

## Отзыв и ротация

Корзина рядом с каналом на `/settings/intake` удаляет ключ: следующий же запрос с ним
получает `404`. Уже принятые лиды остаются на месте.

Ротация выглядит так: выпустить новый ключ → подставить его в `send_lead.php` и
задеплоить лендинг → убедиться, что тестовая заявка дошла → удалить старый ключ.
