# Status — tutoring manager

_Updated: 2026-10-10 · **project complete** · live at https://boazvivianhazan-bot.github.io/boazteachSite/_

## 1. DONE

All stages are built, tested on your real account and phone, and approved: 1, 2, 3, 4, 4b and 5.

### What the app does
- **Calendar (יומן):**
  - A day view on the phone and a week view on a computer.
  - Shows every event from your shown Google calendars, colored by calendar, with overlapping events side by side, all-day events in a top row, and zoom.
  - Lessons stand out with 💻 (Zoom) or 🏠 (frontal).
  - Green free-slot suggestions follow each day's work hours and the break between lessons. Dashed "צמוד" (back-to-back) slots skip the break for the same address or Zoom.
  - Tap any time or event to book. "העתק שעות פנויות" (copy free hours) copies the next 7 days' free time for WhatsApp.
- **Booking:**
  - Student list with the most recently booked first, or a quick new student. Lesson types as buttons, ×1/×2/×3, price.
  - Weekly lessons (series), kept 8 weeks ahead automatically.
  - Past lessons are saved to the sheet only by default, with an optional "גם ליומן" (also to calendar).
  - Warnings for overlaps, short breaks, work hours and the מוקד shift. They never block saving.
  - After saving, "+ שיעור צמוד" (add back-to-back lesson).
  - Calendar events are titled "💻 זום – name" / "🏠 name – פרונטלי", and editing or cancelling a lesson updates its event.
- **Conflict alerts:**
  - Checks the next 4 weeks against your events, highlight rules and Israeli holidays (eves from 13:00).
  - Each conflict offers הזז (move), דחה (postpone), השאר (keep) and a ready WhatsApp message, sent to the parent if set.
- **Students (תלמידים):** search, student card with call / WhatsApp / Waze, unpaid balance, history, weekly lessons, and a "פרטים חסרים" (details missing) tag.
- **Monthly summary (סיכום חודשי):**
  - Any month, with cards, breakdowns by type and by student, and a 6-month income chart.
  - A lesson table with done / paid / cancel toggles, and highlighting for past lessons still marked "planned".
  - Excel export.
- **Settings (הגדרות):** lesson types and prices, per-day work hours, break length, calendars, highlight rules, and delete test data (the only hard delete).
- **Data:** everything lives in your Google Calendar and the "Lessons DB" sheet (LessonTypes, Students, Lessons, Series, Settings). Nothing personal is in the code, the public repo or the browser's storage.
  - The sheet can be edited by hand: rows are found by id and columns by header name, and broken rows are repaired on load.
  - Rows are never deleted; cancelling changes the status.
- **Installable** on Android and iPhone, and the app screen opens offline.

### How to make changes later
- **No code needed:** prices, lesson types, work hours, break, calendars and highlight rules are all in **הגדרות** (Settings). A price change only affects new lessons.
- **Code changes:**
  1. Run `npm run dev` and open http://localhost:5173. To test safely without touching real data, use `?mock=demo`.
  2. Make sure `npm run build` passes.
  3. Commit and push (see the next section).
- The README section **"שינויים בעתיד"** (future changes) has a table of which file controls what, and the rules to keep:
  - New sheet columns go at the end of `COLUMNS`.
  - Never delete rows.
  - Change calendar events only through the marker-checked `patchOwnEvent` / `deleteOwnEvent`.
  - Bump `EVENT_TITLE_VERSION` if the lesson-title format changes.
  - No personal data in the repo.

### How to deploy
```bash
git add -A
git commit -m "describe the change"
git push
```
Every push to `main` runs GitHub Actions (`.github/workflows/deploy.yml`), which builds and publishes the site in a minute or two. You can watch the run in the repo's **Actions** tab. If a run fails, the previous version stays live. The installed app on your phone picks up the new version the next time it opens (sometimes after closing and reopening it twice).

Repo: https://github.com/boazvivianhazan-bot/boazteachSite. Commits are signed "Boaz" with your GitHub noreply address.

## 2. IN PROGRESS

Nothing.

## 3. NOT STARTED

Nothing planned. New ideas can start a new stage; add them here when they come up.

## 4. QUESTIONS

- **Open, optional:** the first two commits on GitHub are signed with the name "boazvivianhazan-bot" (same noreply email). Renaming them to "Boaz" means a force-push that rewrites history. They stay as they are unless you ask.
