# COPY — ревизия текстов продукта

Волна полишинга, 13.08.2026. Проверка 2: тексты продукта одним голосом.

Этот файл ничего не правит. Он собран для интегрирующего агента: колонка «как надо» —
готовая к вставке строка, колонка «почему» — критерий, по которому строка судилась.

**Критерий один:** поможет ли строка подрядчику из Оттавы, который открыл экран впервые и
торопится. Всё, что требует от него знания слова «tenant», «SMTP», «payload», «attribute»
или «P&L», проваливает его по определению.

---

## 0. Как читалось

Грепом по `src/**` (скрипт извлечения — квадратные кавычки, шаблонные литералы и текст
между `>` и `<`, минус классы Tailwind и технические ключи) плюс глазами по экранам на
порту 3082 под ролью ADMIN, ширины 1440 и 390.

| Что | Сколько |
|---|---|
| Различимых пользовательских строк в `src/**` (без демо-данных и прайс-бука) | **1 006** |
| Строк прайс-бука (`src/lib/price-book.ts` — описания позиций сметы) | **104** |
| Строк демо-заполнения (`src/lib/demo-seed.ts`) — прочитаны, в счёт не идут | 24 |
| **Всего проверено** | **1 110** |
| **Предлагается изменить** | **74** |
| Из них видит клиент подрядчика (бумага, письма) | 11 |
| Разработческий язык на экране | 21 |
| Одно понятие разными словами | 17 |
| Ошибка или пустое состояние без следующего шага | 14 |
| Мелочь (регистр, канцелярит, порядок слов) | 11 |

Экраны, снятые для чтения глазами: `/login`, `/` (Dispatch), `/leads`, `/invoices`,
`/reports`, `/finance`, `/contracts`, `/tasks`, `/settings`, `/settings/intake`,
`/projects/<id>`, печатный счёт (`/api/invoices/<id>/pdf`), печатная смета
(`/api/projects/<id>/estimate/pdf`). Снимки: `var/polish/copy/`.

---

## 1. Глоссарий продукта — одно понятие, одно слово

Канон. Следующий агент берёт слово отсюда и новое не изобретает.

### 1.1 Сущности

| Понятие | Слово продукта | Запрещённые двойники, найденные в коде |
|---|---|---|
| Заявка до продажи | **lead** | enquiry, inquiry, submission |
| Работа | **job** | project (только в коде и API), order |
| Бумажный тикет этой работы | **work order** (`WO-2026-0042`) | — |
| Смета | **estimate** | quote, quotation |
| Счёт | **invoice** | bill |
| Люди подрядчика | **crew** | team, team member, staff |
| Один человек в бригаде | **crew member** (в поле — **tech**) | member, worker (только как роль доступа) |
| Единица работы на доске | **task** | to-do, item |
| Выезд к клиенту | **stop** | visit (только у сервисного договора), appointment |
| Клиент | **client** | customer (допустим в прозе о его клиенте), account |
| Оборудование на адресе | **unit** (заголовок полосы — **Iron on site**) | equipment, appliance |
| Договор на сезонное обслуживание | **contract** | plan, service plan |
| Набор месяцев в договоре | **schedule** | plan |
| Расход | **cost** | expense (осталось в CSV-ключах API) |
| Прибыль работы | **margin** — «collected minus costs» | P&L, profit and loss, economics |
| Рекламный бюджет | **ad spend** | media buy, budget |
| Канал | **channel** | source (в коде — поле `source`, на экране — channel) |
| Рабочее место / этот CRM | **the desk** | workspace (только в тексте про доступ), console |
| Серверная сторона | **the office** | the server, the backend |
| Ключ приёма лидов | **intake key** | API key, token |

### 1.2 Действия (глагол в кнопке и глагол в тосте — один)

| Действие | Кнопка | Тост об успехе |
|---|---|---|
| Завести лид рукой | `Log lead` | `Lead logged` |
| Завести клиента | `Add client` | `Client added` |
| Завести работу | `Open job` | `Job opened` |
| Завести задачу | `Add task` | `Task added` |
| Завести оборудование | `Add unit` | `Unit added` |
| Принять деньги | `Save` | `Payment recorded` |
| Записать расход | `Save` | `Cost recorded` |
| Выставить счёт | `Issue invoice` | `Invoice issued` |

Сейчас в продукте «recorded», «logged», «added», «saved» стоят вперемешку на одинаковых
действиях (`Unit recorded` против `Client added`, `Lead logged` против `Lead saved`).
Таблица выше — разводка: «recorded» остаётся только за деньгами.

### 1.3 Шаблон отказа

Одна форма на весь продукт:

```
<что именно не вышло> — <почему или что проверить>. <что сделать>.
```

- называть предмет: «Denise Roy did not move», а не «Update failed»;
- называть причину словами подрядчика: «no answer from the office»;
- давать выход: «Press it again», «Check the signal», «Try again in a moment»;
- сообщения, длиннее сорока знаков, живут в `ErrorNote` рядом с местом отказа. Тост
  длиннее сорока знаков на телефоне разворачивается в семистрочный блок 195×119 px и
  гаснет через 2.6 с (замерено, см. §8.1).

### 1.4 Шаблон пустого состояния

```
<факт: чего нет>            ← eyebrow, без точки
<что кладёт сюда строку>    ← одно предложение
[кнопка, которая это делает]
```

Слова «Loading…», «Something went wrong», «Error», «Failed», «Invalid», «Unknown»,
«Unauthorized», «Payload», «required» в интерфейсе не появляются никогда.

---

## 2. P0 — это читает клиент подрядчика

Одиннадцать строк уходят из продукта наружу: на бумагу, которую подрядчик отдаёт в руки,
и в письма его заказчику. Ошибка здесь стоит подрядчику лица.

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/lib/document.ts:140` | `const statusWord = overdue ? \`OVERDUE · ${late} ${late === 1 ? "DAY" : "DAYS"} LATE\` : doc.status;` | `const PAPER_STATUS: Record<string, string> = { DRAFT: "DRAFT", SENT: "", PARTIAL: "PART PAID", PAID: "PAID IN FULL", VOID: "CANCELLED", ACCEPTED: "ACCEPTED", REJECTED: "", DECLINED: "" };`<br>`const statusWord = overdue ? \`OVERDUE · ${late} ${late === 1 ? "DAY" : "DAYS"} LATE\` : (PAPER_STATUS[doc.status] ?? "");` | В углу листа, который держит заказчик, печатается сырой статус базы. На смете это `SENT` (проверено: `EST-2026-LE-1`, снимок `paper-estimate-1440.png`), а на отклонённой — `REJECTED`. Заказчику слово `SENT` не сообщает ничего, слово `REJECTED` сообщает лишнее |
| `src/lib/document.ts:368` | `<div class="eyebrow">Bill to</div>` | `<div class="eyebrow">${isInvoice ? "Bill to" : "Prepared for"}</div>` | На смете никого ещё не выставляют счёт. «Bill to» на цене, которую человек только рассматривает, читается как требование денег |
| `src/lib/document.ts:353` | `<span class="k">Valid until</span><span class="mono">${date(doc.validUntil)}</span>` | `${doc.validUntil ? \`<div><span class="k">Valid until</span><span class="mono">${date(doc.validUntil)}</span></div>\` : ""}` | При пустом `validUntil` печатается `Valid until —`, и подпись под линией подписи ссылается на этот прочерк (см. следующую строку). Пустая строка убирается целиком, как убираются пустые реквизиты выше |
| `src/lib/document.ts:441` | `${esc(doc.validUntil ? \`Prices hold until ${date(doc.validUntil)}\` : "Prices hold until the date above")}` | `${esc(doc.validUntil ? \`Prices hold until ${date(doc.validUntil)}\` : "Prices hold for 30 days from the date issued")}` | «the date above» указывает на `—`, когда даты нет. Проверено на живой смете: `Valid until —` вверху, `Prices hold until the date above` внизу |
| `src/lib/document.ts:422` | `Return this stub with payment${b.email ? \`, or reply to ${esc(b.email)} to arrange it\` : ""}.` | `${b.email ? \`Return this stub with payment, or reply to ${esc(b.email)} to arrange it.\` : "Ask us where to send payment — the details are on the way. Reply to the message this invoice came with."}` | У обоих живых воркспейсов реквизиты пусты, и корешок печатает «Return this stub with payment.» без адреса, куда его вернуть. Инструкция без адресата — это не инструкция |
| `src/lib/document.ts:399` | `<span class="l">HST / GST</span>` | `<span class="l">HST</span>` | Обе конторы в Онтарио, там HST. Двойная подпись заставляет заказчика гадать, что именно с него взяли |
| `src/lib/document.ts:444` | `Sign and return this page, or reply to the email this estimate came with.` | `Sign and return this page, or reply to the message this estimate came with.` | Продукт смету по почте не отправляет (см. §11.1): подрядчик передаёт её из рук или через мессенджер. Строка обещает письмо, которого не было |
| `src/lib/reminders.ts:39` | `const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-CA") : "on receipt";` | `const due = t.dueDate ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" }).format(new Date(t.dueDate)) : "on receipt";` | Письмо о просрочке печатает `2026-07-22`, а счёт в том же конверте — `Jul 22, 2026`. Чисто числовая дата читается канадцем и американцем по-разному |
| `src/lib/email.ts:25` | `subject: \`Your Estimate from HandymanPro\`` | `subject: \`Estimate ${estimateRef} — ${businessName}\`` (функция принимает имя конторы и номер сметы) | Заказчик подрядчика получает письмо от вендора CRM. Клиент Korvex не заказывал ничего у «HandymanPro» |
| `src/lib/email.ts:28-29` | `<p>Please find your estimate attached. To accept or decline, please reply to this email.</p><p>Thank you for your business!</p>` | `<p>Your estimate is attached — ${estimateRef}, ${total}.</p><p>Reply to this email to accept it, or to ask for a change.</p><p>— ${businessName}</p>` | «Please find … attached» — канцелярит; «Thank you for your business!» — восклицательный знак и бодрость там, где человек ещё ничего не решил; письмо не называет ни сумму, ни номер, ни отправителя |
| `src/lib/email.ts:33` | `filename: \`estimate-${estimateId}.pdf\`` | `filename: \`${estimateRef}.pdf\`` (`EST-2026-0004.pdf`) | В почте заказчика лежит `estimate-cms3jnlyt0000h67gcedey1c9.pdf`. Номер сметы у продукта уже есть — `docRef("EST", …)` |

> `src/lib/email.ts` сейчас никем не вызывается (`grep -rn sendEstimateEmail src` — одно
> объявление). Интегратору: либо переписать по таблице, либо удалить файл, чтобы он не
> ушёл в прод при первом же подключении.

---

## 3. P0 — разработческий язык на экране подрядчика

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/app/(dashboard)/invoices/[id]/page.tsx:98` | `toast(\`Not sent: ${data.reason \|\| data.error}\`, "bad")` | `toast(data.reason === "no email on file" ? \`No email on file for ${invoice.clientName} — call the number on the invoice\` : "The reminder did not go out — email is not set up on this desk yet", "bad")` | Сейчас на экран печатается `Not sent: SMTP not configured` и дословный отказ почтового сервера (`Invalid login: 535-5.7.8 …` — зафиксировано в FIELD-TEST А22). Владелец конторы не знает слова SMTP и не может ничего с ним сделать |
| `src/app/(dashboard)/invoices/[id]/page.tsx:97` | `toast(\`Reminder sent — ${data.stage}\`)` | `const STAGE_WORD = { notice: "a copy of the invoice", nudge: "a reminder", call: "a request for a date", final: "a final notice" };`<br>`toast(\`Sent ${STAGE_WORD[data.stage]} to ${invoice.clientName}\`)` | Печатает внутреннее имя ступени: `Reminder sent — nudge`, `Reminder sent — final`. Ступени названы для кода |
| `src/lib/reminders.ts:114` | `reason: "SMTP not configured"` | `reason: "email is not set up on this desk"` | Строка доходит до экрана через `data.reason` |
| `src/lib/notify.ts:557` | `detail: "email skipped (SMTP not configured)"` | `detail: "email is not set up on this desk yet"` | Печатается дословно на `Settings → Lead alerts` под кнопкой «Send a test» |
| `src/lib/notify.ts:836` | `detail: "workspace not found"` | `detail: "this desk could not be read — sign out and back in"` | Там же |
| `src/lib/notify.ts:829` | `detail: "nothing is configured yet"` | `detail: "no channel is set up yet — save a Telegram chat id or an email address above"` | Там же. Отказ назван, следующий шаг молчит |
| `src/lib/offline-queue.ts:527` | `if (r.reason === "invalid") return "the server refused the change";` | `if (r.reason === "invalid") return "the office would not take it";` | Техник в подвале читает про «сервер». В продукте серверная сторона называется «the office» (`OfflineBar.tsx:130`, `JobPhotos.tsx:84`) |
| `src/lib/offline-queue.ts:534` | `return \`${verb} rejected — the job is no longer on your board\`` | `return \`${verb} did not stick — this job is off your board now\`` | «Rejected» читается техником как «тебе отказали», хотя работу просто сняли с его доски |
| `src/lib/offline-queue.ts:535` | `return \`${verb} rejected — ${rejectionReason(r)}\`` | `return \`${verb} did not stick — ${rejectionReason(r)}\`` | То же |
| `src/components/JobPhotos.tsx:84` | `failed = data?.error \|\| \`The shot did not reach the office (${res.status})\`` | `failed = data?.error \|\| "The shot did not reach the office — try it again when you have a bar of signal"` | Код HTTP на экране техника. Число `413` не говорит ему ничего и не подсказывает, что делать |
| `src/app/(dashboard)/leads/page.tsx:151` | `toast(\`${lead.name} did not move — the desk could not reach the server\`)` | `toast(\`${lead.name} did not move — no answer from the office\`, "bad")` | Слово «server»; плюс тост об отказе шёл тоном `ok` (зелёная спина на плохой новости) |
| `src/app/(dashboard)/leads/[id]/page.tsx:292` | `toast("Those changes were not saved — the desk could not reach the server")` | `toast("Those changes were not saved — no answer from the office", "bad")` | То же |
| `src/app/(dashboard)/leads/[id]/page.tsx:307` | `toast("The lead did not move — the desk could not reach the server")` | `toast("The lead did not move — no answer from the office", "bad")` | То же |
| `src/app/(dashboard)/leads/[id]/page.tsx:329` | `toast("That call was not written down — the desk could not reach the server")` | `toast("The call was not written down — no answer from the office", "bad")` | То же |
| `src/app/(dashboard)/leads/[id]/page.tsx:385` | `"This lead could not be loaded — the desk did not get an answer from the server."` | `"This lead did not open — the office did not answer. Press Try again."` | То же, плюс следующий шаг назван |
| `src/app/admin/page.tsx:57` | `setError("No answer from the desk — check that the server is up.")` | `setError("No answer from the office — reload the page in a minute.")` | Консоль оператора всё же экран, а не лог |
| `src/app/(dashboard)/settings/intake/page.tsx:212` | `"Paste it into send_lead.php on the landing page. The steps are in docs/INTAKE.md."` | `"Paste it into the form handler on your landing page. Whoever built the page needs this address and nothing else."` | Путь к файлу репозитория на экране владельца конторы. Файла у него нет и не будет |
| `src/app/(auth)/login/page.tsx:77` | `points={["Multi-channel intake", "Estimates → invoices", "Crew board", "Job P&L"]}` | `points={["Leads from every channel", "Estimates → invoices", "Crew board", "Profit on every job"]}` | «Multi-channel intake» и «Job P&L» — язык слайда для инвестора. Первый экран продукта |
| `src/app/(auth)/login/page.tsx:79` | `{slug ? \`Tenant · ${slug}\` : "Sign in"}` | `{slug ? \`Workspace · ${slug}\` : "Sign in"}` | «Tenant» — слово из схемы базы |
| `src/app/api/settings/business/route.ts:65` | `summary: \`Updated business details on printed documents (${Object.keys(data).join(", ")})\`` | завести словарь `const FIELD_WORD = { businessName: "name", businessAddress: "address", businessPhone: "phone", businessEmail: "email", hstNumber: "HST number", paymentInstructions: "payment instructions" };` и печатать `\`Updated business details (${Object.keys(data).map(k => FIELD_WORD[k] ?? k).join(", ")})\`` | Журнал действий — экран, который владелец открывает в споре с клиентом. Сейчас там строка `Updated business details on printed documents (businessAddress, hstNumber)` |
| `src/app/api/invoices/[id]/route.ts:124` | `\`Moved ${invoice.number} … from ${invoice.status} to ${body.status}\`` | `\`Moved ${invoice.number} (${money(invoice.totalCents)}) for ${invoice.clientName} from ${WORD[invoice.status]} to ${WORD[body.status]}\`` с `const WORD = { DRAFT: "draft", SENT: "sent", PARTIAL: "part paid", PAID: "paid", VOID: "cancelled" }` | Сырые значения перечисления в человеческой фразе журнала |

### 3.1 Отказы API, доходящие до экрана через `data.error`

Шесть экранов печатают `data.error` как есть, когда своей строки у них нет:
`settings/users:72`, `settings/intake:83`, `settings/business:73`, `settings/notifications:111`,
`account:67`, `register:26`, `contracts:179`, `JobPhotos:111`. Пока API отдаёт строки ниже,
эти строки — интерфейс.

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/lib/guard.ts:14`, `src/middleware.ts:79,103` и 22 маршрута | `"Unauthorized"` | `"You are signed out — sign in again"` | Слово из спецификации HTTP |
| `src/lib/guard.ts:31` | `"Admins only"` | `"The owner's login opens this"` | «Admin» — роль в базе; на экране `Settings → Team` доступ уже назван словами |
| 30+ маршрутов | `"Not found"` | `"That record is gone — it was deleted, or the link points at another workspace"` | Пустая констатация без выхода |
| `src/app/api/register/route.ts:64` | `"businessName, email, and password are required"` | `"Fill in the business name, the email and the password"` | Имена полей из JSON на экране регистрации |
| `src/app/api/settings/business/route.ts:50` | `"Nothing to save"` | `"Nothing changed on this form"` | «Nothing to save» читается как отказ записать |
| `src/app/api/tasks/route.ts:37`, `projects/route.ts:111`, `leads/route.ts:59` и др. | `"Unknown assignee"` | `"That crew member is not on this desk"` | «Assignee» — слово трекера задач |
| `src/app/api/reports/channels/route.ts:21,27` | `"Bad year"` / `"Bad month"` | `"That year is outside the books"` / `"Pick a month from the list"` | «Bad» как оценка ввода |
| `src/app/api/reports/channels/route.ts:32` | `"Unknown trade"` | `"That trade is not on this desk"` | То же |
| `src/lib/enums.ts:63` | `\`Unknown ${field}\`` | `\`That ${field} is not one this desk offers\`` | Печатается в теле 400 вместе со списком допустимых значений |
| `src/app/api/intake/[key]/route.ts:81` | `"Payload too large"` | `"That form sent too much — trim the longest answer"` | Строку читает тот, кто чинит лендинг; «payload» здесь всё же лишнее |
| `src/app/api/projects/[id]/photos/route.ts:92` | `"Expected a multipart upload"` | `"No photo came with that request"` | То же |
| `src/app/api/settings/users/route.ts:65`, `finance/payments:74` и др. | `"id required"` | `"Nothing was picked to remove"` | Имя поля из запроса |

---

## 4. P1 — одно понятие разными словами

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/app/(dashboard)/settings/page.tsx:24` | `title: "Team"` | `title: "Crew"` | Рельс, экран `/tasks`, счётчик дашборда и подсказки в этом же файле говорят «crew». «Team» живёт только здесь |
| `src/app/(dashboard)/settings/users/page.tsx:100` | `<LaneHead title="New team member" />` | `<LaneHead title="New crew member" />` | То же |
| `src/app/(dashboard)/settings/users/page.tsx:163` | `"Add member"` | `"Add crew member"` | То же |
| `src/app/(dashboard)/settings/users/page.tsx:78` | `confirm("Remove this team member? …")` | `"Remove this crew member? The login stops working immediately."` | То же |
| `src/app/(dashboard)/settings/users/page.tsx:89` | `title="Team"` | `title="Crew"` | Заголовок страницы должен совпасть с индексом настроек |
| `src/app/(dashboard)/invoices/page.tsx:120` | сегмент полосы `{ key: "OPEN", … }` | `{ key: "SENT & DRAFT", … }` | Полоса называет `OPEN` ровно те деньги, которые полосы ниже называют `Awaiting payment` + `Drafts`, а подпись под ними — `Drafted`. На демо-базе `OPEN $19,741.10` буква в букву равно `DRAFTED $19,741.10` (снимок `invoices-1440.png`). Настоящее лечение — разделить сегмент, см. §11.2 |
| `src/app/register/page.tsx:50` | `"Profit and loss per job"` | `"Profit on every job"` | На `/login` то же обещание звучит `Job P&L`, на карточке работы — `Job economics`, в коде — `margin`. Одно понятие, четыре слова |
| `src/app/(dashboard)/projects/[id]/page.tsx:693` | `<LaneHead title="Job economics" />` | `<LaneHead title="Did this job make money" />` | «Economics» — слово бухгалтера. Полоса и так заканчивается вердиктом `MARGIN — COLLECTED MINUS COSTS` |
| `src/app/(dashboard)/page.tsx:375`, `leads/[id]:417`, `api/search/route.ts:93` | `"General inquiry"` | `"No job type given"` | Соседняя подсказка на том же экране (`page.tsx:358`) пишет «enquiry», три места пишут «inquiry». Само слово тут лишнее: строка обозначает пустое поле, а не вид заявки |
| `src/app/(dashboard)/finance/page.tsx:474`, `projects/[id]/page.tsx:1042` | `{["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"].map(...)}` | подписать через словарь `const COST_WORD = { MATERIALS: "Materials", LABOR: "Labour", TOOLS: "Tools", VEHICLE: "Vehicle", OTHER: "Other" }`, значение опции оставить прежним | Прайс-бук на соседнем экране печатает `Labourer — day rate`, `Technician labour`, `General labour` — канадское написание. В выпадающем списке расходов стоит американское `LABOR` |
| `src/app/(dashboard)/reports/page.tsx:465` | `Settings → Lead intake` | `Settings → Landing intake` | Экрана «Lead intake» не существует: индекс настроек и заголовок страницы называют его `Landing intake` |
| `src/app/(dashboard)/projects/page.tsx:604` | `<div className="eyebrow">New work order</div>` | `<div className="eyebrow">New job</div>` | Кнопка над формой — `New job`, кнопка под формой — `Open job`, заголовок формы — `New work order`. «Work order» остаётся именем бумаги (`WO-2026-0042`), а не именем действия |
| `src/app/(dashboard)/leads/[id]/page.tsx:702` | `<div className="eyebrow">New work order</div>` | `<div className="eyebrow">New job</div>` | То же, в модалке конверсии |
| `src/app/(dashboard)/clients/[id]/page.tsx:210` | `toast("Unit recorded")` | `toast("Unit added")` | «Recorded» в продукте закреплено за деньгами (`Payment recorded`, `Cost recorded`). Оборудование добавляют |
| `src/app/(dashboard)/leads/[id]/page.tsx:296` | `toast("Lead saved")` | `toast("Lead updated")` | На листе лидов создание даёт `Lead logged`; «saved» на карточке — третье слово для второго действия |
| `src/app/(dashboard)/projects/[id]/estimate/page.tsx:130` | `toast(\`${t.label} loaded — ${t.lineItems.length} lines\`)` | `toast(\`${t.label} — ${t.lineItems.length} lines added\`)` | «Loaded» — слово программы о себе; человек видит, что строки появились |
| `src/app/(dashboard)/reports/page.tsx:323` | `eyebrow="Media buy"` | `eyebrow="Ad spend"` | «Media buy» — язык агентства. Весь экран ниже говорит `AD SPEND` |

---

## 5. P1 — ошибки и пустые состояния без следующего шага

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/app/(dashboard)/leads/page.tsx:572` | `<BandRule>Gone quiet · nobody answered for 2 days</BandRule>` | `<BandRule>Gone cold · nobody here has called back for 2 days</BandRule>` | Полоса собирает лиды, которым **не перезвонила контора** (`bandOf`: `!answered && ms >= STALE_MS`). Текущая фраза вешает вину на клиента и снимает её с владельца — ровно наоборот смыслу экрана |
| `src/app/(dashboard)/leads/page.tsx:524` | `` `${live.length} to call` `` | `` `${live.length} fresh · ${cold.length} gone cold` `` | Шапка печатает `0 TO CALL`, а под ней три строки с телефонами и таймерами `WAITING 130D 22H` (снимок `leads-1440.png`). Число спорит с тем, что человек видит |
| `src/components/ChaseLane.tsx:106` | `<LaneHead title="Call · no email on file" lamp="var(--rose)" />` | `<LaneHead title="Chase by hand · no email on file" lamp="var(--rose)" />` | Полоса просит звонить, и каждая её строка отвечает `NO PHONE ON FILE` (снимок `dispatch-1440.png`). Заголовок обещает действие, которого на этих строках нет |
| `src/app/(dashboard)/clients/page.tsx:118` | `toast("Could not add the client", "bad")` | `toast(\`${form.name || "That client"} was not added — no answer from the office\`, "bad")` | Отказ назван, причина и следующий шаг молчат |
| `src/app/(dashboard)/clients/[id]/page.tsx:224` | `toast("Could not save the unit", "bad")` | `toast("The unit was not saved — check the serial and try again", "bad")` | То же |
| `src/components/JobPhotos.tsx:111` | `toast(data?.error \|\| "Could not delete the photo", "bad")` | `toast("The photo is still there — the office did not answer", "bad")` | То же |
| `src/app/(dashboard)/contracts/page.tsx:179` | `toast(err.error \|\| "Could not start the contract", "bad")` | `toast("The contract was not started — pick a client and at least one visit month", "bad")` | Единственная реальная причина отказа этого маршрута — пустой список месяцев (`api/contracts/route.ts:84`). Её и надо назвать |
| `src/app/(dashboard)/projects/[id]/estimate/page.tsx:230` | `toast("Could not issue the invoice — the job or the estimate would not price", "bad")` | `toast("No invoice was issued — this estimate has no priced lines on it", "bad")` | «Would not price» — не английская фраза |
| `src/app/(dashboard)/settings/intake/page.tsx:222` | `{loading && <Empty>Loading your keys…</Empty>}` | `{loading && <Skeleton lines={2} />}` | «Loading…» в рамке пустого состояния читается как «пусто». POLISH-SPEC §5 |
| `src/app/(dashboard)/settings/users/page.tsx:174` | `{loading && <Empty>Loading the team…</Empty>}` | `{loading && <Skeleton lines={3} />}` | То же |
| `src/app/(dashboard)/leads/[id]/page.tsx:361` | `confirm("Delete this lead?")` | заменить `window.confirm` на подтверждение экрана: строка `This deletes ${lead.name} and everything written down about the call. It cannot be undone.` и две кнопки `Delete lead` / `Keep it` | Единственное на экране окно вне языка продукта: чужой шрифт, чужие кнопки, слово «Delete this lead?» без последствий |
| `src/app/(dashboard)/settings/users/page.tsx:78` | `confirm("Remove this crew member? …")` | то же подтверждение экрана | То же |
| `src/app/(dashboard)/settings/notifications/page.tsx:117` | `confirm("Forget the bot token? …")` | то же подтверждение экрана | То же |
| `src/components/JobPhotos.tsx:107` | `confirm("Delete this photo? It is the proof this job was done.")` | то же подтверждение экрана (текст сохранить дословно — он хороший) | То же |

---

## 6. P2 — мелочь

| файл:строка | как сейчас | как надо | почему |
|---|---|---|---|
| `src/app/(dashboard)/page.tsx:298` | `title="Jobs in the yard"` | `title="Jobs on the books"` | В полосе стоят и завершённые работы; двор — место, где стоят машины. У ремонтной конторы двора нет |
| `src/app/(dashboard)/projects/page.tsx:704` | `<LaneHead title="NO MATCH" right={controls} />` | `<LaneHead title="Nothing found" right={controls} />` | «No match» — язык фильтра, а не человека |
| `src/app/(dashboard)/contracts/page.tsx:311` | `<span className="eyebrow">Booked value a year</span>` | `<span className="eyebrow">Value per year</span>` | «Value a year» — сломанный порядок слов |
| `src/app/(dashboard)/reports/page.tsx:450` | `<div className="eyebrow">Nothing to attribute yet</div>` | `<div className="eyebrow">No channel has anything to show yet</div>` | «Attribute» — слово из аналитики |
| `src/app/(dashboard)/reports/page.tsx:155` | `<Step label="Reached" … />` | `<Step label="Got hold of" … />` | Подрядчик говорит «дозвонился», не «достиг» |
| `src/lib/notify.ts:844` | `` `Sent ${clockAt(...)} from your CRM.` `` | `` `Sent ${clockAt(...)} from your desk.` `` | Продукт называет себя «the desk» на всех остальных экранах |
| `src/components/layout/Sidebar.tsx:92` | `{business \|\| "Work-order desk"}` | оставить | Проверено, замечаний нет — записано, чтобы не переписывали |
| `src/app/(dashboard)/settings/notifications/page.tsx:144` | `"Test alert sent. It is on the phone within a few seconds — if nothing arrives, the chat id belongs to another chat."` | `"Test alert sent. It lands on the phone within a few seconds. If nothing arrives, the chat id points at another chat."` | Тире-противопоставление в середине; «is on the phone» читается как «звонит по телефону» |
| `src/app/(dashboard)/settings/notifications/page.tsx:354` | `"A failed alert never costs you the lead — it is on the call sheet either way, and …"` | `"A failed alert still leaves the lead on the call sheet, and …"` | Предложение построено на отрицании |
| `src/app/(dashboard)/invoices/page.tsx:367` | `"Nothing overdue — the street is clean"` | оставить | Проверено: лучшая строка в продукте, менять нечего |
| `src/app/expired/page.tsx:52` | `"To reopen this workspace instead, ask the person who set it up to upgrade it — the plan changes on the operator console and the desk opens again on the next sign-in."` | `"To reopen this workspace, ask the person who set it up to upgrade the plan. The desk opens again on the next sign-in."` | Тридцать слов на экране, где человек уже потерял доступ; «operator console» ему знать незачем |

---

## 7. Что ломается на длинном имени и на пустом значении

### 7.1 Тост с именем клиента внутри отказа — замерено

Событие: `handymanpro:toast` с текстом
`"Northline Supply & Warehouse Logistics Ltd did not move — the desk could not reach the server"`
на ширине 390.

Результат замера в браузере: коробка тоста **195 × 119 px** — семь строк моноширинного
текста поперёк экрана, гаснет через 2.6 с (`Toaster.tsx:38`). Прочесть за это время
нельзя.

Лечение — правило §1.3: имя клиента и причина отказа в одном тосте не помещаются. Тост
несёт короткое утверждение (`Northline Supply did not move`), причина живёт в `ErrorNote`
рядом с тем местом, где отказ произошёл. Отдельно интегратору: `Toaster.tsx:59` стоит
дать `max-w-[min(92vw,360px)]`, но это уже верстка, а не текст.

Строки, попадающие в эту ловушку: `leads/page.tsx:151,180`, `leads/[id]/page.tsx:292,307,329`,
`invoices/[id]/page.tsx:97,98,128`, `projects/page.tsx:447`, `contracts/page.tsx:179`.

### 7.2 Пустое значение

| Где | Что печатается при пустом значении | Как надо |
|---|---|---|
| `src/lib/document.ts:353` | `Valid until —` | строку убрать целиком (§2) |
| `src/lib/document.ts:441` | `Prices hold until the date above` — ссылка на прочерк | `Prices hold for 30 days from the date issued` (§2) |
| `src/lib/document.ts:422` | `Return this stub with payment.` без адреса | текст из §2 |
| `src/app/(dashboard)/page.tsx:375` | `General inquiry` вместо типа работы | `No job type given` (§4) |
| `src/lib/notify.ts:479` | `no phone given` | оставить — проверено, честно и коротко |
| `src/app/(dashboard)/leads/page.tsx:180` | `` `${form.name \|\| "That lead"} was not saved` `` | оставить — запасное слово подставлено правильно |

---

## 8. Что проверено и оставлено как есть

Чтобы следующий агент не переписывал заново то, что уже держит голос:

- пустые состояния листа лидов (три штуки: пустой воркспейс, пустой фильтр, чистый лист)
  и все `hint` карточки работы, счетов, сметы, картотеки, контрактов;
- письма-напоминания `src/lib/reminders.ts:42-94` — четыре ступени тона, ни одного
  восклицательного знака, слово «overdue» не появляется в первую неделю;
- текст алерта о новом лиде `src/lib/notify.ts:463-523` — имя, номер в набираемом виде,
  время ожидания, ссылка;
- `Settings → Business details`, включая объяснение номера HST;
- офлайн-полоса и штамп возраста доски на `/today`;
- 104 позиции прайс-бука: единицы (`sq ft`, `lf`, `ea`, `hr`, `day`, `lot`), канадское
  написание, ottawa-2026 цены — замечаний нет, кроме `LABOR` в перечислении расходов (§4);
- `Nothing overdue — the street is clean`, `No signal — held until you are back`,
  `Take the money, record it here, and the office sees it the moment you have signal`.

Эмодзи в интерфейсе: **ноль** (`grep -P '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src` —
пусто). Запрещённая конструкция «not X, but Y»: **ноль** осталась, обе прошлые (`/login`
и `/reports`) переписаны в этой волне. Два предложения ещё открываются отрицанием —
`settings/notifications:354` и `settings/notifications:144`, см. §6.

---

## 9. Требует решения владельца (переименование статусов)

Эти изменения меняют слово на экране, но само значение живёт в базе, в API и в тестах.
Переименовать можно только подписью, оставив значение прежним, — и делать это надо один
раз во всём продукте.

1. **`VERIFIED` / «Mark verified» / «Verify».** FIELD-TEST А12: подрядчику слово ничего не
   сообщает. Предлагаемая подпись: **`WORTH QUOTING`**, кнопка — **`Worth quoting`**.
   Места: `leads/page.tsx:44,288,290`, `leads/[id]/page.tsx:53,491,596`, ладдер стадий,
   рельс дашборда, `reports`. Значение `VERIFIED` в базе не трогать.
2. **`Iron on site`.** HVAC-жаргон на экране, который открывают и мувинговая контора, и
   ремонтная. Для перевозчика на адресе стоит не «iron». Предлагаемая подпись:
   **`What's on site`**. Места: `clients/[id]/page.tsx:523`, `AddressHistory.tsx:77`.
   Против: формулировка закреплена в DESIGN.md, ревизия 3.1.
3. **`OVERVIEW` как имя вкладки** карточки работы (`projects/[id]/page.tsx:158`) — слово
   из дашбордов. Предлагается **`THE JOB`**.

---

## 10. Функциональные находки попутно (не копирайт, не чинил)

1. `src/lib/email.ts` не вызывается ниоткуда: смету отправить по почте нельзя, при этом
   печатный лист обещает «reply to the email this estimate came with» (§2).
2. Полоса старения на `/invoices` складывает `SENT` и `DRAFT` в сегмент `OPEN`
   (`invoices/page.tsx:111-113`). Копирайтом лечится только подпись; настоящее лечение —
   разделить сегмент. Совпадает с находкой агента группы «Счета».
3. `src/lib/enums.ts:41` объявляет `PHOTO_KINDS = [... "RECEIPT"]`, а схема Prisma и
   `JobPhotos.tsx` знают `DOC` («Paperwork»). Константа мёртвая и расходится со схемой.
4. `/api/tenant/resolve?slug=demo` отдаёт 404 на каждой загрузке (подтверждаю в пятый раз).
5. `sendTestNotification` возвращает `detail` дословно из транспорта, поэтому любой новый
   отказ канала снова окажется на экране без перевода. Правильнее сопоставлять причину со
   словарём в одном месте, а дословный ответ канала печатать под фразой (как это уже
   сделано на экране алертов).
