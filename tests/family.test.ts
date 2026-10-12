// Family balance tests (the two-sisters case) — run: npm test
import assert from 'node:assert/strict'
import { computeBalances, computeStudentBalances, toCollect } from '../src/data/billing.ts'

const st = (id: string, extra: any = {}) => ({ id, name: id, phone: '', address: '', buildingCode: '', floorApt: '', defaultLessonTypeId: '', zoomLink: '', notes: '', active: true, allowedLessonTypeIds: [], parentName: '', parentPhone: '', familyId: '', paysMonthly: false, ...extra })
const ls = (id: string, studentId: string, date: string, price: number, status = 'done') => ({ id, studentId, date, start: '16:00', end: '16:45', price, status } as any)
const pm = (payerId: string, amount: number) => ({ id: 'p' + amount + payerId, payerId, amount, date: '2026-10-10', method: '', notes: '' })

const sisters = [st('dana', { familyId: 'fm' }), st('noa', { familyId: 'fm' })]
const lessons = [ls('a', 'dana', '2026-10-01', 130), ls('b', 'noa', '2026-10-02', 130)]

// --- the reported case: 2 sisters × 130 ---------------------------------------------
// before paying: each sister owes her OWN 130; the family owes 260 (not 520)
let own = computeStudentBalances(lessons, [], sisters)
assert.equal(own.get('dana')!.balance, -130)
assert.equal(own.get('noa')!.balance, -130)
assert.equal(computeBalances(lessons, [], sisters).get('fm')!.balance, -260)
assert.equal([...computeBalances(lessons, [], sisters).values()].reduce((s, b) => s + (b.balance < 0 ? -b.balance : 0), 0), 260) // open debt counted once

// one family payment of 260 → both balanced, family balanced
own = computeStudentBalances(lessons, [pm('fm', 260)], sisters)
assert.equal(own.get('dana')!.balance, 0)
assert.equal(own.get('noa')!.balance, 0)
assert.equal(computeBalances(lessons, [pm('fm', 260)], sisters).get('fm')!.balance, 0)

// --- FIFO and leftover credit ---------------------------------------------------------
// 130 pays the OLDEST lesson (Dana's, 1/10) first
own = computeStudentBalances(lessons, [pm('fm', 130)], sisters)
assert.equal(own.get('dana')!.balance, 0)
assert.equal(own.get('noa')!.balance, -130)
// partial: 200 → Dana 0, Noa −60
own = computeStudentBalances(lessons, [pm('fm', 200)], sisters)
assert.deepEqual([own.get('dana')!.balance, own.get('noa')!.balance], [0, -60])
// overpay 300 → both 0; the 40 credit stays at family level
own = computeStudentBalances(lessons, [pm('fm', 300)], sisters)
assert.deepEqual([own.get('dana')!.balance, own.get('noa')!.balance], [0, 0])
assert.equal(computeBalances(lessons, [pm('fm', 300)], sisters).get('fm')!.balance, 40)

// planned / cancelled / postponed lessons are never charged
own = computeStudentBalances([...lessons, ls('c', 'noa', '2026-10-03', 130, 'planned'), ls('d', 'noa', '2026-10-04', 130, 'cancelled')], [pm('fm', 260)], sisters)
assert.deepEqual([own.get('dana')!.balance, own.get('noa')!.balance], [0, 0])

// a student paying alone keeps her credit
const solo = [st('yossi')]
own = computeStudentBalances([ls('y', 'yossi', '2026-10-01', 120)], [pm('yossi', 500)], solo)
assert.equal(own.get('yossi')!.balance, 380)

// "לגבות היום" on a new 130 lesson uses the FAMILY credit: 40 left → collect 90; in debt → full 130
assert.equal(toCollect({ status: 'planned', price: 130 }, 40), 90)
assert.equal(toCollect({ status: 'planned', price: 130 }, -260), 130)
console.log('family balances: all tests passed')
