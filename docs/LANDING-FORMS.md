# Лендформа: готовая форма заявки для лендинга

Три способа посадить форму лендинга на канал intake — от «вставил две строки» до
серверного форварда. Ключ и сам канал заводятся по [INTAKE.md](INTAKE.md); здесь
только подключение со стороны лендинга.

Во всех вариантах лендинг обязан пережить смерть CRM: заявка в Telegram/CAPI и экран
благодарности не зависят от того, ответил ли intake.

---

## Вариант 1. Виджет `intake-embed.js`

Для страниц, где своей формы ещё нет. Две строки в HTML:

```html
<div id="hp-intake"></div>
<script src="https://korvex.crm.example.com/intake-embed.js"
        data-intake-url="https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ"
        data-lang="en"></script>
```

Виджет рисует форму «имя / телефон / сообщение» внутри `div`, отправляет JSON прямо в
intake и показывает экран благодарности. Внутри одного файла всё: разметка, стили,
отправка. Внешних шрифтов и библиотек нет — лендинги живут на шаред-хостингах, где
упавший CDN означает мёртвую форму под платным трафиком.

Атрибуты `<script>`:

| Атрибут | Что делает |
|---|---|
| `data-intake-url` | полный URL канала, обязателен |
| `data-lang` | `en` (по умолчанию) либо `uk` — язык подписей и сообщений |
| `data-target` | id контейнера, если `hp-intake` на странице занят |

Что уже сделано внутри и не требует настройки:

- **Стили наследуются от страницы** — шрифт, цвет текста и фона берутся у лендинга,
  виджет дорисовывает только рамки полей и два цвета состояний. Форма выглядит частью
  страницы, а не баннером чужого продукта.
- **Honeypot** — скрытое поле `company_website`. Бот, который его заполнил, видит
  экран благодарности, но запрос в CRM не уходит: показать боту ошибку — значит
  пригласить его пробовать, пока не пролезет.
- **Защита от даблкликов** — кнопка гаснет на время отправки, а каждая попытка несёт
  свой `event_id`, поэтому даже досланный после обрыва связи повтор схлопнется в один
  лид на стороне CRM.
- **Телефон обязателен** — endpoint принял бы и email, но покупатели этой формы —
  подрядчики, и лид, которому нельзя позвонить, для них не лид.

Цена варианта: ключ виден в исходном коде страницы, любой желающий сможет слать
заявки от имени канала. Защита — троттлинг (10 с IP за 10 минут, 60 на ключ в час) и
отзыв ключа на `/settings/intake`. Клиентам с рекламным бюджетом — вариант 3.

---

## Вариант 2. Обычная `<form>` без JavaScript

Для страниц, где скриптам не место (AMP-подобные, письма-лендинги, параноидальный CSP).
Браузерная `<form>` шлёт `application/x-www-form-urlencoded`, а intake принимает только
JSON — поэтому форма ходит не в CRM, а в маленький PHP-приёмник на самом лендинге,
который переупаковывает поля и форвардит их дальше.

Разметка:

```html
<form method="post" action="/lead.php">
  <label>Your name <input type="text" name="name" required maxlength="120"></label>
  <label>Phone <input type="tel" name="phone" required maxlength="40"></label>
  <label>How can we help? <textarea name="message" maxlength="1000"></textarea></label>
  <!-- honeypot: у людей поле спрятано, бот его заполнит -->
  <div style="position:absolute;left:-6000px" aria-hidden="true">
    <label>Website <input type="text" name="company_website" tabindex="-1" autocomplete="off"></label>
  </div>
  <button type="submit">Send request</button>
</form>
```

`lead.php` рядом с ней:

```php
<?php
/* ── HandymanPro CRM: приёмник формы без JS ── */
const CRM_INTAKE_URL = 'https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ';
const THANK_YOU_URL  = '/thank-you.html';

/* Honeypot заполнен — бот. Показываем ту же благодарность, никуда не шлём. */
if (!empty($_POST['company_website'])) {
    header('Location: ' . THANK_YOU_URL, true, 303);
    exit;
}

$lead = [
    'event_id' => 'form_' . time() . '_' . bin2hex(random_bytes(3)),
    'name'     => trim($_POST['name']    ?? ''),
    'phone'    => trim($_POST['phone']   ?? ''),
    'message'  => trim($_POST['message'] ?? ''),
    'page'     => ($_SERVER['HTTP_REFERER'] ?? ''),
];

$ch = curl_init(CRM_INTAKE_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 4,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($lead, JSON_UNESCAPED_UNICODE),
]);
@curl_exec($ch);   /* ответ CRM игнорируется: посетитель уходит на благодарность в любом случае */
curl_close($ch);

header('Location: ' . THANK_YOU_URL, true, 303);
```

Бонус варианта: ключ лежит в PHP на сервере лендинга и в исходный код страницы не
попадает.

---

## Вариант 3. Форвард из существующего хендлера

Для лендингов, у которых форма и её обработчик уже есть (`send_lead.php` у Korvex и
Beaver). Ничего не переписывается: в конец хендлера, после Telegram и CAPI, ставится
кусок, который дошлёт уже собранный массив в CRM.

```php
/* ── HandymanPro CRM ── */
const CRM_INTAKE_URL = 'https://korvex.crm.example.com/api/intake/wo_ВАШ_КЛЮЧ';

$crm = $lead;                                /* массив, который уже ушёл в Telegram */
unset($crm['ip'], $crm['ua'], $crm['ts']);   /* в CRM это шум */

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

Таймаут короткий и ошибки глотаются намеренно: доставка в CRM не имеет права ломать
уже отработавшую цепочку «jsonl → Telegram → CAPI». Упал intake — заявка всё равно
дошла до владельца через Telegram, а CRM догонит из повтора или руками.

Пофайловые примеры для обоих живых квизов — в [INTAKE.md, шаг 3](INTAKE.md).

---

## Проверка после подключения

1. Отправить тестовую заявку с самого лендинга (не curl-ом — важно пройти путь
   посетителя целиком).
2. Убедиться, что лид появился в **Leads** со статусом NEW и в заметке видны имя
   канала и текст сообщения.
3. На `/settings/intake` у канала обновилась строка «last lead».
4. Отправить ту же форму второй раз — в CRM остался один лид (дедуп).
5. Удалить тестовый лид из карточки.

Строка «no leads yet» через неделю после запуска рекламы означает, что цепочка
рвётся на одном из шагов выше.
