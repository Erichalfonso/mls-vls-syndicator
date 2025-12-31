// Extension routes - Chrome extension communication

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// All routes require authentication
router.use(authenticateToken);

// POST /api/extension/authenticate - Extension login
router.post('/authenticate', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        subscriptionTier: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Authentication failed'
    });
  }
});

// POST /api/extension/record-action - Record action during AI learning
router.post('/record-action', async (req: AuthRequest, res) => {
  try {
    const { workflowId, action } = req.body;

    if (!workflowId || !action) {
      return res.status(400).json({
        success: false,
        error: 'workflowId and action are required'
      });
    }

    // Verify workflow ownership
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userId: req.userId
      }
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    if (workflow.status !== 'learning') {
      return res.status(400).json({
        success: false,
        error: 'Workflow is not in learning mode'
      });
    }

    // Append action to recorded actions
    const currentActions = (workflow.recordedActions as any[]) || [];
    const updatedActions = [...currentActions, {
      ...action,
      timestamp: new Date().toISOString(),
      step: currentActions.length + 1
    }];

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        recordedActions: updatedActions
      }
    });

    res.json({
      success: true,
      data: {
        workflow: updated,
        actionNumber: updatedActions.length
      },
      message: `Recorded action ${updatedActions.length}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record action'
    });
  }
});

// POST /api/extension/get-next-action - Get next action for deterministic mode
router.post('/get-next-action', async (req: AuthRequest, res) => {
  try {
    const { workflowId, listingId, currentStep } = req.body;

    if (!workflowId || !listingId) {
      return res.status(400).json({
        success: false,
        error: 'workflowId and listingId are required'
      });
    }

    // Verify workflow ownership
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userId: req.userId
      }
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    if (workflow.status !== 'ready' && workflow.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Workflow is not ready for deterministic playback'
      });
    }

    // Get listing data
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        userId: req.userId
      }
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing not found'
      });
    }

    // Get recorded actions
    const actions = (workflow.recordedActions as any[]) || [];

    if (currentStep >= actions.length) {
      // Workflow complete
      return res.json({
        success: true,
        data: {
          done: true,
          message: 'Workflow execution complete'
        }
      });
    }

    // Get next action
    const nextAction = actions[currentStep];

    // Replace placeholders with actual listing data
    const replacePlaceholders = (value: string) => {
      if (typeof value !== 'string') return value;

      return value.replace(/{{(\w+)}}/g, (match, fieldName) => {
        const field = fieldName.toLowerCase();

        // Map common field names
        const fieldMap: any = {
          address: listing.address,
          city: listing.city,
          state: listing.state,
          zipcode: listing.zipCode,
          zip: listing.zipCode,
          price: listing.price?.toString(),
          bedrooms: listing.bedrooms?.toString(),
          bathrooms: listing.bathrooms?.toString(),
          squarefeet: listing.squareFeet?.toString(),
          description: listing.description,
          mlsnumber: listing.mlsNumber
        };

        return fieldMap[field] || (listing.listingData as any)?.[fieldName] || match;
      });
    };

    // Process action
    const processedAction = {
      ...nextAction,
      value: replacePlaceholders(nextAction.value),
      text: replacePlaceholders(nextAction.text)
    };

    res.json({
      success: true,
      data: {
        action: processedAction,
        step: currentStep,
        totalSteps: actions.length,
        done: false
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get next action'
    });
  }
});

// POST /api/extension/report-result - Report success/failure
router.post('/report-result', async (req: AuthRequest, res) => {
  try {
    const { listingId, success: actionSuccess, error } = req.body;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        error: 'listingId is required'
      });
    }

    // Update listing status
    const listing = await prisma.listing.update({
      where: { id: listingId },
      data: {
        uploadStatus: actionSuccess ? 'completed' : 'failed',
        uploadResult: {
          success: actionSuccess,
          error: error || null,
          timestamp: new Date().toISOString()
        },
        uploadedAt: actionSuccess ? new Date() : null
      }
    });

    res.json({
      success: true,
      data: { listing },
      message: actionSuccess ? 'Listing uploaded successfully' : 'Listing upload failed'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to report result'
    });
  }
});

// POST /api/extension/ai-decision - Get AI decision for current state (AI learning mode)
router.post('/ai-decision', async (req: AuthRequest, res) => {
  try {
    const { screenshot, goal, currentUrl, availableElements } = req.body;

    if (!screenshot || !goal) {
      return res.status(400).json({
        success: false,
        error: 'screenshot and goal are required'
      });
    }

    // Use Claude to decide next action
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 8192,
      thinking: {
        type: 'enabled',
        budget_tokens: 5000
      },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.replace(/^data:image\/png;base64,/, '')
            }
          },
          {
            type: 'text',
            text: `You are a browser automation agent in LEARNING MODE. Your goal: ${goal}

Current page: ${currentUrl}

Available interactive elements:
${JSON.stringify(availableElements, null, 2)}

Analyze the page and decide the next action. Respond with JSON:
{
  "action": "click" | "type" | "scroll" | "navigate" | "upload" | "wait_for",
  "selector": "CSS selector",
  "value": "{{FIELD_NAME}}" (use placeholders for data fields),
  "field_label": "human-readable field name",
  "reasoning": "why this action",
  "done": false | true
}

Important: Use placeholder variables like {{ADDRESS}}, {{PRICE}}, {{BEDROOMS}} for any data that will change per listing.`
          }
        ]
      }]
    });

    // Debug logging
    console.log('API Response structure:', {
      hasContent: !!response.content,
      contentType: typeof response.content,
      isArray: Array.isArray(response.content),
      contentLength: Array.isArray(response.content) ? response.content.length : 'N/A'
    });

    // Extract text and JSON from response
    // Validate response.content is an array before calling .find()
    if (!Array.isArray(response.content)) {
      console.error('Invalid response.content:', response.content);
      throw new Error(`Invalid API response structure: content is not an array (got ${typeof response.content})`);
    }

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const fullText = textContent.text;

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const actionData = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      data: {
        action: actionData,
        response: actionData.reasoning || fullText
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get AI decision'
    });
  }
});

export default router;
