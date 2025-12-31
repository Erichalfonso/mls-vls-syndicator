// Payment routes - Stripe integration

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import Stripe from 'stripe';

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Stripe (optional - only if API key is provided)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia'
    })
  : null;

// Pricing configuration
const PRICING_PLANS = {
  basic: {
    name: 'Basic',
    price: 1999, // $19.99 in cents
    monthlyRunsLimit: 100,
    priceId: process.env.STRIPE_BASIC_PRICE_ID
  },
  pro: {
    name: 'Pro',
    price: 4999, // $49.99
    monthlyRunsLimit: 500,
    priceId: process.env.STRIPE_PRO_PRICE_ID
  },
  business: {
    name: 'Business',
    price: 9999, // $99.99
    monthlyRunsLimit: 9999999, // Unlimited
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID
  }
};

// POST /api/payments/create-checkout - Create Stripe checkout session
router.post('/create-checkout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing is not configured'
      });
    }

    const { plan } = req.body;

    if (!plan || !PRICING_PLANS[plan as keyof typeof PRICING_PLANS]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan selected'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const planDetails = PRICING_PLANS[plan as keyof typeof PRICING_PLANS];

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: planDetails.priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?payment=canceled`,
      metadata: {
        userId: user.id.toString(),
        plan
      }
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

// POST /api/payments/webhook - Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('Missing stripe signature');
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = parseInt(session.metadata?.userId || '0');
        const plan = session.metadata?.plan || 'basic';

        if (userId && session.subscription) {
          // Update user subscription
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: plan,
              stripeCustomerId: session.customer as string
            }
          });

          // Create subscription record
          const planDetails = PRICING_PLANS[plan as keyof typeof PRICING_PLANS];

          await prisma.subscription.create({
            data: {
              userId,
              stripeSubscriptionId: session.subscription as string,
              plan,
              status: 'active',
              monthlyRunsLimit: planDetails.monthlyRunsLimit,
              monthlyRunsUsed: 0
            }
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
          }
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Downgrade to free tier
        const dbSubscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          include: { user: true }
        });

        if (dbSubscription) {
          await prisma.user.update({
            where: { id: dbSubscription.userId },
            data: { subscriptionTier: 'free' }
          });

          await prisma.subscription.update({
            where: { id: dbSubscription.id },
            data: { status: 'canceled' }
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// GET /api/payments/portal - Get customer portal URL
router.get('/portal', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing is not configured'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`
    });

    res.json({
      success: true,
      data: { url: session.url }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create portal session'
    });
  }
});

export default router;
