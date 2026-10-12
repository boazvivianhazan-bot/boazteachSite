# Status — tutoring manager

_Updated: 2026-10-12 · **stage 7 (group lessons) approved and deployed** · live at https://boazvivianhazan-bot.github.io/boazteachSite/_

## 1. DONE AND READY TO TEST

Stages 1–7 are approved and live. Stage 7 was tested on your real account. The list below stays as a reference.

### Before you start
- From the project folder run `npm run dev`, then open **http://localhost:5173** and log in (your real account and sheet).
- On first open, new columns are added at the end of three tabs automatically: `groupPrices` (LessonTypes), `groupId` (Lessons) and `studentIds` (Series). Nothing else in your data changes.
- Use test students for the group tests if you prefer. "מחיקת נתוני בדיקה" (delete test data) removes them afterwards.

### Stage 7 tests
1. **Group prices:** הגדרות → a lesson type → **"מחיר לתלמיד בשיעור קבוצתי"** (price per student in a group lesson): fill in 2 / 3 / "4 ומעלה" (4 or more). An empty field means the regular price.
2. **Booking a group:** pick a student, then **"+ הוסף תלמיד לשיעור"** (add a student to the lesson), once or twice.
   - The price field changes to "מחיר לתלמיד (קבוצה של N)" (price per student, group of N) and follows the group size (e.g. 130 → 100 → 90). You can still edit it.
   - The save button shows students and total, e.g. "3 תלמידים · 270 ₪".
3. **After saving, check Google Calendar:**
   - **One event** titled "🏠 קבוצה – דנה, נועה, יוסי (3)" (Zoom: "💻 זום קבוצה – …").
   - The description lists the students with their phones.
   - The **Lessons tab has a row per student** with the same `groupId`.
4. **Charged per student:** each student's balance shows only their own row. Two sisters in one family both charge the family, as in stage 6.
5. **In the app calendar:** one block "קבוצה – … (N)". Tap it to see each student's price and status, with "₪ גבייה" (collect) per student and "התקיים לכל הקבוצה" (done for the whole group).
6. **Cancel one student:**
   - "ביטול רק ל<name>" → "לבטל?" (cancel only for <name> → confirm). Only that student is cancelled, and the event keeps going with the remaining names (with one left, it becomes a regular one-on-one title).
   - Then **"לעדכן את המחיר…? X ₪ → Y ₪"** (update the price?) appears for the remaining students. "כן, לעדכן" (yes, update) changes their price; "לא, להשאיר" (no, keep) leaves it.
   - "ביטול לכל הקבוצה" (cancel the whole group) cancels everyone and deletes the event.
7. **Edit a group:** "עריכה" (edit) shows all members as chips. Changing the time or type updates every row and the single event. Removing a chip cancels only that student; adding one joins the same event.
8. **Weekly group:** with 2+ students, turn on "שיעור קבוע כל שבוע" (repeat weekly).
   - Every week gets a row per student and one event per week.
   - The Series tab lists all students (`studentIds`), and the series shows on every member's card as "👥 …".
   - Ending it cancels the future weeks for everyone.
9. **Monthly summary:**
   - "שיעורים שהתקיימו" (lessons done) **counts a group lesson once**, while income counts every student.
   - "לפי סוג שיעור" (by lesson type) counts the group once; "לפי תלמיד" (by student) shows each student's own income.
   - Group rows are marked "👥 קבוצה".
10. **Conflicts:** a clashing group appears as **one** card "קבוצה – …". "דחה" (postpone) and "השאר" (keep) apply to the whole group, and there's a WhatsApp button per student.

**Tested on the demo data:**
- The automatic tests pass (`npm test`). They cover group price by size, every student charged in their own balance, and sisters in one group paid by their family.
- On the demo:
  - one block per group
  - cancelling one student updated the event and repriced only on confirm (100 → 130)
  - booking 3 students at 90 created one event and three rows
  - editing moved the event and cancelled the removed student
  - a weekly group series of 3 weeks × 2 students
  - the summary counted 17 lessons from 19 rows
  - one conflict card for the group
  - group prices saved in Settings

## 2. IN PROGRESS

Nothing. Stage 7 is live.

## 3. NOT STARTED

Nothing planned. A per-student price inside a group isn't needed for now (your decision); it's possible later if needed.

## 4. QUESTIONS

None.
