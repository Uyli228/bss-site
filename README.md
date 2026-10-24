# 🐝 Вулик — наш сайт по Bee Swarm Simulator

Сайт збирається автоматично через GitHub Pages: змінив файл → через 1-2 хвилини зміни на сайті.
Все можна робити прямо на github.com у браузері (кнопка **Add file** або ✏️ на файлі).

## 🛠️ Адмінка

https://uyli228.github.io/bss-site/admin/ — вхід за GitHub-токеном. Щоб закрити адмінку, видали папку `admin`.

## 📊 Додати таблицю або гайд (запис)

1. Відкрий папку `_posts` → **Add file → Create new file**.
2. Назва файлу обов'язково у форматі `РРРР-ММ-ДД-назва-латиницею.md`, наприклад `2026-11-01-kraschi-bdzholy.md`.
3. Вміст:

```markdown
---
title: Найкращі бджоли
categories: таблиці        # таблиці / гайди / новини / інше
description: Короткий опис для картки
cover: /assets/gallery/моя-картинка.png   # необов'язково
---

Текст запису. Таблиця:

| Бджола | Колір | Рідкість |
|---|---|---|
| Tabby Bee | Червоний | Event |
| Vicious Bee | Синій | Event |
```

4. Натисни **Commit changes**.

Нову категорію можна додати у `_config.yml` у блок `categories_meta`.

## 🖼️ Додати картинку

Відкрий папку `assets/gallery` → **Add file → Upload files** → перетягни картинки → **Commit changes**.
Вони самі з'являться на сторінці «Галерея». Щоб вставити картинку в запис:

```markdown
![Опис]({{ '/assets/gallery/назва.png' | relative_url }})
```

## 🔗 Додати посилання

Відкрий `_data/links.yml` і допиши за зразком:

```yaml
    - name: Назва
      url: https://...
      icon: "⭐"
      note: Короткий опис
```

Відступи (пробіли) важливі — копіюй сусідній рядок.

## 🐝 Бджоли й поля

- Бджоли: `_data/bees.yml` — рядок `- { name: "Назва Bee", rarity: epic, color: red, note: "коментар" }`
  (rarity: common / rare / epic / legendary / mythic / event; color: red / blue / white).
- Поля: `_data/fields.yml`.

## 👥 Як дати друзям редагувати

На GitHub: **Settings → Collaborators → Add people** і введи їхній нік.
