import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';
import { stripeCommand } from '@/lib/billing/stripe-command';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signingSecret) return NextResponse.json({error:'Stripe webhook not configured'},{status:503});
  const stripe = new Stripe(secret);
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({error:'No signature'},{status:400});
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(),signature,signingSecret); }
  catch { return NextResponse.json({error:'Webhook signature verification failed'},{status:400}); }
  try {
    const command = await stripeCommand(event,stripe);
    const {data,error} = await createServiceClient().rpc('process_stripe_event',{
      p_id:event.id,p_type:event.type,p_created:event.created,p_command:command,
    });
    if (error) throw new Error(error.code ?? 'database');
    return NextResponse.json(data);
  } catch (error) {
    // Non-2xx invites Stripe retry. No upstream payloads or client details in logs.
    console.error('[stripe] processing failed',event.id,event.type,error instanceof Error ? error.name : 'Error');
    return NextResponse.json({error:'Event processing failed; retry required'},{status:503});
  }
}
