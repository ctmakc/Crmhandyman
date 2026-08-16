# HandymanPro — workflow допилов

Порядок волн — по принципу «сначала то, что мешает продать продукт, потом то, что мешает
им пользоваться, потом то, что делает его незаменимым». Каждая волна самодостаточна:
её можно отгрузить и показать.

Легенда: **U** — интерфейс, **F** — функционал, **X** — то и другое.

---

## Волна 1 — «бумага и скорость» ✅ СДЕЛАНО 2026-07-27

| # | | Задача | Почему |
|---|---|---|---|
| 1.1 | X | **Единый рендерер документов** для сметы и счёта: печатная A4-вёрстка в языке «НАРЯД», отрывной корешок, `?print=1` для автопечати | Документ должен быть реальным рабочим артефактом, а не экраном CRM |
| 1.2 | F | **PDF/печать счёта** (`/api/invoices/[id]/pdf`) | Счёт без печатной формы клиенту не отправишь |
| 1.3 | F | **Прайс-бук**: готовые позиции и шаблоны работ (HVAC + мувинг), смета собирается в 2 клика | Подрядчик не будет печатать одинаковые позиции руками |
| 1.4 | X | **Просрочка как состояние системы**: OVERDUE, chase-list, фильтр | Деньги на улице — главная боль владельца |
| 1.5 | U | **Cmd/Ctrl+K** по лидам, джобам, счетам | Быстрый рабочий стол |
| 1.6 | U | **Тосты на действия** | Никаких молча сработавших кнопок |
| 1.7 | U | **Скелетоны загрузки** | Пустой экран не должен читаться как поломка |

## Волна 2 — «клиент как сущность» ✅ СДЕЛАНО 2026-07-27

| # | | Задача | Почему |
|---|---|---|---|
| 2.1 | F | **Client** + консервативный бэкфилл | Один человек не должен превращаться в три несвязанных строки |
| 2.2 | X | **Карточка клиента**: джобы, оборудование, счета, owing/lifetime paid/costs | Полная позиция по дому/клиенту |
| 2.3 | F | **Equipment**: вид, марка, модель, serial, install/warranty | HVAC живёт оборудованием и сервисной историей |
| 2.4 | U | **История адреса на джобе** | Техник видит железо и прошлые визиты до выезда |
| 2.5 | X | Client → lead conversion / new job / Cmd+K | Клиент — рабочая сущность, а не справочник |

## Волна 3 — вертикали HVAC и Movers ✅ СДЕЛАНО 2026-07-27

| # | | Задача | Почему |
|---|---|---|---|
| 3.1 | X | **Сервисные контракты** + вычисляемое расписание + idempotent booking | Рекуррентная выручка HVAC |
| 3.2 | X | **Калькулятор переезда** | Мувер считает объёмом, бригадой и временем |
| 3.3 | U | **Нагрузка бригад** | Перебронь должна быть видна до того, как сломан день |
| 3.4 | U | **Режим техника `/today`** | Телефон в поле, call/drive/start/finish в один тап |

## Волна 4 — деньги всерьёз ✅ СДЕЛАНО 2026-08-15

| # | | Задача | Почему |
|---|---|---|---|
| 4.1 | X | **Экономика работы**: quoted → invoiced → collected → costs → margin | Маржа считается от реально полученных денег |
| 4.2 | X | **Депозиты** 50/50, 30/70, 25/75 | Два независимо оплачиваемых документа без расхождений в цент |
| 4.3 | F | **Напоминания по просрочке** 7/14/30+ дней | Дожим без ручной рутины |
| 4.4 | X | **Online card payment / Stripe Checkout** — signed public invoice link, оплата только текущего остатка, provider-signed webhook, exactly-once CRM settlement, mismatch → audit/reconciliation | Клиент может закрыть счёт сам; Stripe не становится вторым источником истины |
| 4.5 | X | **CSV export** invoices/payments/expenses/job margin, Excel-safe | Бухгалтеру не нужен ручной перенос |

> 4.4 реализован в Wave 7 (`agent/wave7-payments-production-finish`). Перед live-mode остаётся обязательный credentialed Stripe test-mode прогон через hosted Checkout и реальный webhook.

## Волна 5 — доверие и эксплуатация ✅ СДЕЛАНО 2026-08-15

| # | | Задача | Почему |
|---|---|---|---|
| 5.1 | F | **Core + DB regressions + CI** | Критические цепочки проверяются автоматически |
| 5.2 | F | **Audit journal** | Кто, что и когда поменял — фиксируется |
| 5.3 | X | **Фото before/after** с телефона, private evidence storage | Доказательство работ и история объекта |
| 5.4 | X | **Production runbook, Docker healthcheck, SQLite backup** | Сервис можно эксплуатировать, а не только запускать локально |
| 5.5 | F | **Signed owned-site lead intake** | Наши лендинги отдают лиды напрямую и проверяемо |

## Волна 6 — production integrity ✅ СДЕЛАНО 2026-08-15

| # | | Задача | Почему |
|---|---|---|---|
| 6.1 | F | **Exactly-once public ingress** через `InboundReceipt` | Повтор webhook не создаёт второй лид |
| 6.2 | F | **Durable rate limits** публичных mutation endpoints | Несколько app instances не обходят in-memory лимит |
| 6.3 | F | **Tenant isolation hardening** | Никаких cross-tenant read/write shortcut-ов |
| 6.4 | F | **Invoice/payment invariants** + concurrent invoice numbering regression | Денежный ledger не расходится при гонках |
| 6.5 | F | **Recurring-service idempotency** через `ServiceVisitReceipt` | Два параллельных booking request не создают два визита |
| 6.6 | F | **Critical production dependency gate** | Critical advisory блокирует release |

## Волна 7 — online payment production finish 🚧 ТЕКУЩАЯ

- signed `/pay/<invoice>?token=...` без клиентского аккаунта;
- Stripe Checkout только на фактический остаток;
- deterministic idempotency key на invoice+balance;
- signature/timestamp verification webhook;
- settlement в существующий `Payment(method=CARD)` + `Invoice.PAID` в одной транзакции;
- exactly-once webhook receipt;
- amount/currency/tenant/invoice mismatch не проводится в ledger, а уходит в audit;
- payment URL появляется на invoice sheet и в overdue reminder;
- regression на tamper/signature/duplicate settlement;
- production runbook и env contract обновлены.

**Release gate Wave 7:** CI green + Stripe test-mode hosted Checkout → webhook → ровно один CARD Payment → PAID invoice.

---

## Актуальный технический долг

- `Estimate` не привязан к тенанту напрямую (только через `Project`) — tenant isolation держится на join; лучше выпрямить модель перед большим объёмом API/reporting.
- `lineItems` остаётся JSON-строкой. Для item-level BI/stock/procurement нужна нормализация.
- SQLite остаётся нормальным single-node operational store, но для multi-instance/high-write SaaS потребуется PostgreSQL и отдельная миграционная волна.
- Stripe live mode нельзя считать проверенным до реального test-mode Checkout/webhook прогона с credentialed endpoint.
- Нужен отдельный browser-level production UX проход по owner desk и technician `/today` после Wave 7, а не только build/regression проверки.
