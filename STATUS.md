# Status — tutoring manager

_Updated: 2026-10-10 · end of stage 5 (deploy waiting for the GitHub repo) · dev server: http://localhost:5173/_

## 1. DONE AND READY TO TEST

Stages 1–4b are approved. **Stage 5 and the new lesson titles are waiting for your test.** The installable app can only be fully tested once the site is on GitHub Pages (see section 2).

### A. Lesson titles (💻 Zoom / 🏠 frontal)
1. Book a Zoom lesson and a frontal lesson, then check Google Calendar:
   - Zoom: title **"💻 זום – <name>"**, location = the Zoom link, and the link is also in the description.
   - Frontal: title **"🏠 <name> – פרונטלי"**, location = address, description = building code, floor/apartment, phone.
   - A ×2 lesson ends with **" ×2"**.
2. In the app calendar, lesson blocks show 💻 or 🏠 instead of 🎓.
3. Edit a lesson's type (Zoom ⇄ frontal, or ×1 ⇄ ×2). The calendar title, location, length and color change too.
4. **One-time fix of existing events:** the first time you open this version, future lesson events the app created (only ones with the app's private marker) are rewritten in the new format. A green notice says **"…: X אירועים עודכנו"** (X events updated). That number is the answer to your question. It runs once (recorded as `eventTitleVersion = 2` in the Settings tab), and past events and events you created yourself are never touched.

### B. Monthly summary (סיכום חודשי tab)
5. **Month picker:** arrows, a dropdown of every month that has lessons, and "החודש" (this month). Opens on the current month.
6. **Cards:**
   - "שיעורים שהתקיימו" (lessons done): e.g. "5 מתוך 12", meaning done out of all planned and done, counted in units (×2 = 2).
   - "הכנסה צפויה" (expected income), "שולם" (paid), "לא שולם" (unpaid).
   - Cancelled and postponed lessons don't count.
7. **Past lessons still "planned":** highlighted in amber in the table, with a strip at the top offering "סמן הכל כהתקיים" (mark all as done).
8. **Income chart:** the last 6 months. Each bar shows the paid part (dark) and the unpaid part (light). Tap a bar to open that month.
9. **Breakdown** by lesson type and by student: lessons, income, unpaid.
10. **Table of all the month's lessons:**
    - Quick buttons per lesson: **התקיים** (done), **שולם** (paid), **בוטל** (cancel, asks first and deletes its event). Cancelled or postponed lessons get a **שחזור** (restore) button instead.
    - Tap a lesson to edit its type, price or time; the calendar event follows.
    - **"+ שיעור שהתקיים"** (add a past lesson) adds a lesson that already happened (sheet only, unless you tick "גם ליומן").
11. **"⬇ ייצוא לאקסל" (export to Excel)** downloads `שיעורים-YYYY-MM.xlsx` with two right-to-left sheets:
    - "שיעורים" (lessons): every lesson in the month, with a totals row.
    - "לפי תלמיד" (by student): lessons, income and unpaid per student, with totals.

### C. Installable app (PWA)
12. After the deploy, open the site on your phone:
    - **Android:** Chrome ⋮ → "התקנת אפליקציה" (install app).
    - **iPhone:** Safari → Share → "הוספה למסך הבית" (add to home screen).
    - It should open full-screen with the teal calendar icon. Without internet, the app screen still opens; the data always comes from Google.

## 2. IN PROGRESS

**GitHub Pages deploy — waiting for you:**
1. On github.com, create an **empty public** repository (no README), e.g. `boazteachSite`.
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Send me the **repo URL**, plus the **name and GitHub noreply email** to put on commits (GitHub → Settings → Emails, looks like `12345+user@users.noreply.github.com`).
4. In Google Cloud Console → Credentials → your OAuth client → **Authorized JavaScript origins**, add `https://<your-user>.github.io`.

Ready locally: a git repository on branch `main` with 75 files staged (no personal data: the only names and phones are the made-up ones in the dev-only demo). Nothing is committed or pushed yet. After you reply I'll commit, push, and check that the deploy succeeded.

## 3. NOT STARTED

Nothing else is planned. All five stages, plus 4b, are built.

## 4. QUESTIONS

- **Repo URL + commit name/email** (section 2).
- **Service worker:** the Claude app's built-in browser doesn't allow service workers, so I couldn't test offline mode here. The manifest, icons, paths under `/boazteachSite/` and the worker's code are all checked. Final confirmation comes from installing on your phone.
