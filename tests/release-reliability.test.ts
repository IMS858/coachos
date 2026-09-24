import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {pacificWeek, sessionDayLabel} from '../lib/time/pacific';
import {stripeCommand} from '../lib/billing/stripe-command';
const event=(type:string,object:object)=>({type,data:{object}} as Stripe.Event);
test('Pacific week boundaries and labels remain correct across UTC midnight and DST',()=>{
 const week=pacificWeek(new Date('2026-09-27T03:00:00Z'));
 assert.equal(week.today,'2026-09-26');assert.equal(week.weekday,6);assert.equal(week.start.toISOString(),'2026-09-20T07:00:00.000Z');
 assert.equal(sessionDayLabel(new Date('2026-09-27T06:00:00Z'),new Date('2026-09-27T03:00:00Z')),'Today');
 assert.equal(sessionDayLabel(new Date('2026-09-27T08:00:00Z'),new Date('2026-09-27T03:00:00Z')),'Tomorrow');
 const spring=pacificWeek(new Date('2026-03-10T12:00:00Z')),fall=pacificWeek(new Date('2026-11-03T12:00:00Z'));
 assert.equal((spring.end.getTime()-spring.start.getTime())/3600000,167);assert.equal((fall.end.getTime()-fall.start.getTime())/3600000,169);
});
test('Stripe unpaid checkout is ignored and invalid paid metadata is rejected',async()=>{
 assert.deepEqual(await stripeCommand(event('checkout.session.completed',{payment_status:'unpaid'}),{} as Stripe),{action:'ignore'});
 await assert.rejects(stripeCommand(event('checkout.session.completed',{payment_status:'paid',metadata:{}}),{} as Stripe),/reconciliation/);
});
test('Stripe subscription state uses a refreshed snapshot, not stale event data',async()=>{
 const stripe={subscriptions:{retrieve:async()=>({id:'sub_1',status:'canceled'})}} as unknown as Stripe;
 assert.deepEqual(await stripeCommand(event('customer.subscription.updated',{id:'sub_1',status:'active'}),stripe),{action:'subscription',subscription_id:'sub_1',status:'cancelled'});
});
test('Stripe refund normalization uses individual successful refund amounts across pages',async()=>{
 const stripe={charges:{retrieve:async()=>({payment_intent:'pi_1',customer:'cus_1'})},refunds:{list:async function*(){yield {id:'re_1',amount:100,currency:'usd',created:1,status:'succeeded'};yield {id:'re_pending',amount:400,currency:'usd',created:2,status:'pending'};yield {id:'re_2',amount:200,currency:'usd',created:3,status:'succeeded'};}}} as unknown as Stripe;
 const command=await stripeCommand(event('charge.refunded',{id:'ch_1',amount_refunded:300}),stripe);
 const refunds=command.refunds as Array<{amount_cents:number,refund_id:string}>;
 assert.deepEqual(refunds.map(r=>r.amount_cents),[100,200]);assert.deepEqual(refunds.map(r=>r.refund_id),['re_1','re_2']);
});
