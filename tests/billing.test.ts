// Billing unit tests — run: npm test (plain Node, no test framework)
import assert from 'node:assert/strict'
import { buildPayers, computeBalances, toCollect, prepaidLessons, monthlyBills, familyName, balanceText } from '../src/data/billing.ts'

const st = (id: string, name: string, extra: any = {}) => ({ id, name, phone: '', address: '', buildingCode: '', floorApt: '', defaultLessonTypeId: '', zoomLink: '', notes: '', active: true, allowedLessonTypeIds: [], parentName: '', parentPhone: '', familyId: '', paysMonthly: false, ...extra })
const ls = (id: string, studentId: string, date: string, price: number, status: string) => ({ id, studentId, date, start: '16:00', end: '16:45', price, status } as any)
const pm = (payerId: string, amount: number, date = '2026-10-01') => ({ id: 'p' + Math.random(), payerId, amount, date, method: '', notes: '' })

const students = [
  st('dana', 'דנה כהן', { familyId: 'fm1', parentName: 'רחל כהן' }),
  st('noa', 'נועה כהן', { familyId: 'fm1', paysMonthly: true }),
  st('yossi', 'יוסי לוי'),
]
const payers = buildPayers(students)
assert.equal(payers.size, 2)
assert.equal(payers.get('fm1')!.name, 'משפחת כהן')
assert.equal(payers.get('fm1')!.paysMonthly, true)
assert.equal(familyName([st('a', 'דנה כהן'), st('b', 'נועה כהן', { parentName: 'רחל' })]), 'דנה + נועה')

const lessons = [
  ls('1', 'dana', '2026-10-01', 130, 'done'),
  ls('2', 'noa', '2026-10-02', 130, 'done'),
  ls('3', 'noa', '2026-10-03', 130, 'cancelled'),   // never charged
  ls('4', 'dana', '2026-10-04', 130, 'postponed'),  // never charged
  ls('5', 'dana', '2026-10-20', 130, 'planned'),    // not yet charged
  ls('6', 'yossi', '2026-10-05', 240, 'done'),
  ls('7', 'ghost', '2026-10-06', 100, 'done'),      // student row gone → charged to its own id
]
const payments = [pm('fm1', 200), pm('yossi', 500), pm('yossi', 0)]
const b = computeBalances(lessons, payments, students)
assert.deepEqual(b.get('fm1'), { charges: 260, paid: 200, balance: -60 })
assert.deepEqual(b.get('yossi'), { charges: 240, paid: 500, balance: 260 })
assert.deepEqual(b.get('ghost'), { charges: 100, paid: 0, balance: -100 })
assert.equal(balanceText(-60, (n) => n + ' ₪'), 'חוב 60 ₪')
assert.equal(balanceText(260, (n) => n + ' ₪'), 'זכות 260 ₪')
assert.equal(balanceText(0, (n) => n + ' ₪'), 'מאוזן')

// לגבות היום
assert.equal(toCollect({ status: 'planned', price: 130 }, -60), 130)  // debt doesn't reduce
assert.equal(toCollect({ status: 'planned', price: 130 }, 50), 80)    // credit 50
assert.equal(toCollect({ status: 'planned', price: 130 }, 260), 0)    // fully prepaid
assert.equal(toCollect({ status: 'done', price: 130 }, -80), 80)      // already done: credit before = 50 → collect 80
assert.equal(toCollect({ status: 'done', price: 130 }, 0), 0)         // done and exactly covered

// prepaid
assert.equal(prepaidLessons(260, 120), 2)
assert.equal(prepaidLessons(-10, 120), 0)

// monthly bills: family pays monthly (Noa's flag), owes 60 after paying 200
const bills = monthlyBills('2026-10', lessons, payers, b)
assert.equal(bills.length, 1)
assert.equal(bills[0].payer.id, 'fm1')
assert.deepEqual(bills[0].lessons.map((l: any) => l.id), ['1', '2'])
assert.equal(bills[0].monthCharges, 260)
assert.equal(bills[0].before, 200)   // credit 200 before this month's charges
assert.equal(bills[0].due, 60)
console.log('billing: all tests passed')
