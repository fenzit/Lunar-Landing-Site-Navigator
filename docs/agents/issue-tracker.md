# Issue tracker

Задачи и спецификации ведутся в [GitHub Issues проекта LunarPilot](https://github.com/fenzit/Lunar-Landing-Site-Navigator/issues). Целевой репозиторий — `fenzit/Lunar-Landing-Site-Navigator`. Перед первой публикацией в сеансе сверь его с `origin` и проверь, что Issues включены. Используй `gh repo view fenzit/Lunar-Landing-Site-Navigator --json nameWithOwner,hasIssuesEnabled` или авторизованный GitHub API, если `gh` недоступен.

## Задачи и спецификации

- Для публикации используй `gh issue create --repo fenzit/Lunar-Landing-Site-Navigator --title "<заголовок>" --body-file "<файл>"`. Если навык задаёт статус, передай соответствующую метку через `--label`.
- Для чтения задачи используй `gh issue view <номер> --json number,title,body,labels,comments`. Для поиска используй `gh issue list` с фильтрами `--state`, `--label` или `--search`.
- Состояние задачи меняй через `gh issue edit <номер> --add-label <метка>` и `--remove-label <метка>`. Имена бери из [Triage labels](triage-labels.md).
- При закрытии сначала опубликуй комментарий с итогом через `gh issue comment <номер> --body-file "<файл>"`, затем выполни `gh issue close <номер>`.

## Вложенные задачи и зависимости

- Для вложенной задачи используй GitHub sub-issues. В `gh` с поддержкой этих команд укажи `--parent <номер>` при создании или `--add-sub-issue <номер>` при редактировании родителя. Если вложенные задачи недоступны, укажи `Part of #<номер>` в описании дочерней задачи.
- Для блокировок используй зависимости GitHub. В поддерживаемой версии `gh` доступны `--blocked-by <номера>` при создании и `--add-blocked-by <номер>` при редактировании. Если зависимости недоступны, укажи `Blocked by: #<номер>` в описании. К задаче можно приступать после закрытия всех блокирующих задач.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

- Храни карту работы в одной задаче с меткой `wayfinder:map`. Связывай с ней дочерние задачи и помечай их `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` или `wayfinder:task`.
- Для следующего шага бери первую по порядку карты открытую дочернюю задачу без исполнителя и открытых блокировок. Назначь её себе. После выполнения добавь комментарий с результатом, закрой задачу и запиши решение со ссылкой в карту.
