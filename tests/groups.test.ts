// Group lesson tests — run: npm test
import assert from 'node:assert/strict'
import { groupPrice } from '../src/data/schema.ts'
import { computeBalances, computeStudentBalances } from '../src/data/billing.ts'

// --- per-student price by group size -------------------------------------------------
const type = { price: 130, groupPrices: { '2': 100, '3': 90, '4': 80 } }
assert.equal(groupPrice(type, 1), 130) // one-on-one
assert.equal(groupPrice(type, 2), 100)
assert.equal(groupPrice(type, 3), 90)
assert.equal(groupPrice(type, 4), 80)
assert.equal(groupPrice(type, 6), 80) // "4+"
assert.equal(groupPrice({ price: 130, groupPrices: { '2': 100 } }, 3), 130) // not set → regular price

// --- each student of a group is charged in their own balance ---------------------------
const st = (id: string, extra: any = {}) => ({ id, name: id, phone: '', address: '', buildingCode: '', floorApt: '', defaultLessonTypeId: '', zoomLink: '', notes: '', active: true, allowedLessonTypeIds: [], parentName: '', parentPhone: '', familyId: '', paysMonthly: false, ...extra })
const row = (id: string, studentId: string, price: number, status = 'done') => ({ id, studentId, date: '2026-10-05', start: '17:00', end: '17:45', price, status, groupId: 'gr1', units: 1 } as any)
const students = [st('a'), st('b'), st('c')]
// a group of 3 at 90 each; c was cancelled → never charged
const lessons = [row('1', 'a', 90), row('2', 'b', 90), row('3', 'c', 90, 'cancelled')]
const b = computeBalances(lessons, [], students)
assert.equal(b.get('a')!.balance, -90)
assert.equal(b.get('b')!.balance, -90)
assert.equal(b.get('c'), undefined)
// two sisters in the same group, one family: the family owes both rows, each sister her own
const sisters = [st('d', { familyId: 'fm' }), st('e', { familyId: 'fm' })]
const sisterRows = [row('4', 'd', 100), row('5', 'e', 100)]
assert.equal(computeBalances(sisterRows, [], sisters).get('fm')!.balance, -200)
const own = computeStudentBalances(sisterRows, [{ id: 'p', payerId: 'fm', amount: 200, date: '2026-10-06', method: '', notes: '' }], sisters)
assert.deepEqual([own.get('d')!.balance, own.get('e')!.balance], [0, 0])
console.log('groups: all tests passed')
