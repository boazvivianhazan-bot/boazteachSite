# Status — tutoring manager

_Updated: 2026-10-12 · **stage 6 approved and deployed** · live at https://boazvivianhazan-bot.github.io/boazteachSite/_

## 1. DONE AND READY TO TEST

Stages 1–5 are approved and live at https://boazvivianhazan-bot.github.io/boazteachSite/.
**Stage 6 is approved (tested on your real account, including the family fix) and deployed.** The list below stays as a reference.

### Before you start
- From the project folder run `npm run dev`, then open **http://localhost:5173** and log in. This is your real Google account and real sheet, running the new code. It's already an authorized sign-in address.
- **On the first open, two automatic one-time changes happen to your real sheet:**
  - A **Payments** tab is created. Every lesson currently marked "paid" becomes a payment (same date, amount = lesson price, note "הועבר מסימון שולם"). A green notice says how many.
  - The Students tab gets two columns at the end: `familyId` and `paysMonthly`.
- The old `paid` column stays in the sheet but is no longer used.

### Stage 6 tests
1. **Migration:** after the first open, check the notice count and the new **Payments** tab: one row per lesson that was marked paid. Open a few students; balances should look right. Reload: it doesn't run twice (`paymentsMigrated = true` in the Settings tab).
2. **Balance on the student card:** a big line with **"זכות X ₪"** (credit, green), **"חוב X ₪"** (debt, red) or **"מאוזן"** (balanced).
   - Below it: "שולם … · שיעורים שהתקיימו …" (paid … · lessons done …), and the payment history.
   - Tap a payment to edit it, or "ביטול התשלום" (cancel payment): the amount becomes 0 and the row stays.
   - The students list shows a red debt or green credit badge per student.
3. **"קיבלתי תשלום" (payment received):** the amount is prefilled with what's owed now and can be changed to any amount. Pick a method and a date, save, and check the balance and a new Payments row.
4. **Prepaid:** record more than the debt. The card shows "משולם מראש – עוד ~N שיעורים" (prepaid, about N more lessons).
5. **Families:** on a student card, "+ קישור לבן/בת משפחה" (link a family member). Students at the same address are suggested first.
   - Linked siblings share one balance ("משפחת <parent's surname>"), and their earlier payments move to the family.
   - "יציאה מהמשפחה" (leave the family) asks first. If only two were linked, the family dissolves and its payments go to the student who stays.
6. **Lesson screen** (tap a 🏠/💻 lesson):
   - It shows the balance and **"לגבות היום: X ₪"** (to collect today) = the price minus any credit, never below 0. Earlier debt isn't added; it's shown in the balance.
   - **"התקיים + קיבלתי X ₪"** (done + received) does both in one tap, with the method chosen above it.
   - "קיבלתי סכום אחר…" (other amount) opens the full form.
   - If credit covers the lesson: "מכוסה מהזכות" (covered by credit).
7. **Booking form:** after picking a student, under the price: "לגבות היום: X ₪", or "משלם בסוף חודש" (pays at the end of the month) with their balance.
8. **Monthly payers:** in the student form, turn on **"משלם בסוף חודש"**. In סיכום חודשי (monthly summary), **"לגבייה החודש"** (to collect this month) lists each such payer with the amount due.
   - Tap a row to see the breakdown.
   - **"וואטסאפ עם הפירוט"** (WhatsApp with breakdown) sends the dates, types, month total, "בניכוי תשלומים / זכות" (minus payments/credit) or earlier debt, and "לתשלום" (to pay). It goes to the parent if set.
   - "קיבלתי תשלום" records the payment.
9. **Monthly summary:**
   - Cards: lessons done, expected income, **"הכנסה מהשיעורים שהתקיימו"** (income earned) and **"כסף שהתקבל החודש"** (money received), plus total open debt.
   - The chart shows earned vs received per month.
   - There's a collapsible list of payments received that month.
   - Each lesson row has **"₪ גבייה"** (collect) instead of "שולם" (paid).
10. **Excel export:** four sheets: שיעורים (lessons), לפי תלמיד (by student), **תשלומים** (the month's payments, with a total) and **יתרות** (every payer's charges, payments and balance as of today, with total open debt).
11. **Family balances (fixed after your report):** two sisters with a 130 ₪ lesson each now show **"חוב 130 ₪"** each (their own), not 260 ₪ each.
    - Family payments are applied to the oldest unpaid lessons across the family first (FIFO). Leftover credit stays with the family.
    - On a sister's card: her own balance is the big line. Under it, **"משפחת X יחד: חוב 260 ₪"** (family X together) with the **"קיבלתי תשלום"** button for the whole family, prefilled with the family total.
    - Badges in the students list show each student's own amount.
    - Open debt, "לגבייה החודש" and the Excel Balances sheet count each family once.
    - "לגבות היום" = lesson price minus the family's available credit.
    - Unit test for exactly this case (2 sisters × 130, then one family payment of 260 → both balanced), plus FIFO, partial and overpayment cases: run `npm test`.
12. **Settings → אמצעי תשלום (payment methods):** add, remove, or move one to the front (the first one is the default for quick collection).

## 2. IN PROGRESS

Nothing. Stage 6 is live.

## 3. NOT STARTED

Nothing planned. New ideas start a new stage.

## 4. QUESTIONS

None.
