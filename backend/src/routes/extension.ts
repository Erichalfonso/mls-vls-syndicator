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

// Conversation history storage (in production, use Redis or database)
const conversationHistory = new Map<string, any[]>();

// POST /api/extension/ai-decision - Get AI decision using Claude computer use
router.post('/ai-decision', async (req: AuthRequest, res) => {
  try {
    const { screenshot, goal, currentUrl, viewportWidth, viewportHeight, sessionId } = req.body;

    if (!screenshot || !goal) {
      return res.status(400).json({
        success: false,
        error: 'screenshot and goal are required'
      });
    }

    // Get or create conversation history for this session
    const historyKey = sessionId || `${req.userId}-${Date.now()}`;
    let messages = conversationHistory.get(historyKey) || [];

    // Screen dimensions (default to common size)
    const displayWidth = viewportWidth || 1280;
    const displayHeight = viewportHeight || 800;

    // If this is the first message, add the goal
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Your task: ${goal}

Current page: ${currentUrl}

Please complete this task by interacting with the browser. Take a screenshot first to see the current state, then perform the necessary actions.`
          }
        ]
      });
    }

    // Add the screenshot as a tool result (simulating computer tool returning screenshot)
    // For the first iteration, we include it as part of the initial context
    if (messages.length === 1) {
      // First message - add screenshot to initial request
      messages[0].content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshot.replace(/^data:image\/png;base64,/, '')
        }
      });
    } else {
      // Subsequent messages - add screenshot as tool result
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: messages[messages.length - 1]?.content?.find((c: any) => c.type === 'tool_use')?.id || 'screenshot',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: screenshot.replace(/^data:image\/png;base64,/, '')
                }
              }
            ]
          }
        ]
      });
    }

    // Call Claude with computer use tool
    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      betas: ['computer-use-2025-01-24'],
      tools: [
        {
          type: 'computer_20250124',
          name: 'computer',
          display_width_px: displayWidth,
          display_height_px: displayHeight
        }
      ],
      messages: messages
    });

    // Store assistant response in history
    messages.push({
      role: 'assistant',
      content: response.content
    });
    conversationHistory.set(historyKey, messages);

    // Parse the response
    const toolUseBlock = response.content.find((block: any) => block.type === 'tool_use');
    const textBlock = response.content.find((block: any) => block.type === 'text');

    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
      // Claude wants to use the computer tool
      const action = toolUseBlock.input as {
        action: string;
        coordinate?: [number, number];
        text?: string;
        key?: string;
        scroll_direction?: string;
        scroll_amount?: number;
      };

      // Convert computer use action to our format
      let convertedAction: any = {
        action: action.action,
        toolUseId: toolUseBlock.id
      };

      switch (action.action) {
        case 'screenshot':
          convertedAction.action = 'screenshot';
          break;
        case 'left_click':
        case 'right_click':
        case 'double_click':
        case 'middle_click':
          convertedAction.action = 'click_coordinates';
          convertedAction.x = action.coordinate?.[0] || 0;
          convertedAction.y = action.coordinate?.[1] || 0;
          convertedAction.clickType = action.action;
          break;
        case 'type':
          convertedAction.action = 'type_text';
          convertedAction.text = action.text || '';
          break;
        case 'key':
          convertedAction.action = 'key_press';
          convertedAction.key = action.text || '';
          break;
        case 'scroll':
          convertedAction.action = 'scroll';
          convertedAction.direction = action.scroll_direction || 'down';
          convertedAction.amount = action.scroll_amount || 3;
          convertedAction.x = action.coordinate?.[0] || displayWidth / 2;
          convertedAction.y = action.coordinate?.[1] || displayHeight / 2;
          break;
        case 'mouse_move':
          convertedAction.action = 'mouse_move';
          convertedAction.x = action.coordinate?.[0] || 0;
          convertedAction.y = action.coordinate?.[1] || 0;
          break;
        case 'wait':
          convertedAction.action = 'wait';
          convertedAction.duration = 1000;
          break;
        default:
          convertedAction.action = action.action;
      }

      res.json({
        success: true,
        data: {
          action: convertedAction,
          response: textBlock?.type === 'text' ? textBlock.text : `Performing: ${action.action}`,
          sessionId: historyKey,
          stopReason: response.stop_reason
        }
      });
    } else if (response.stop_reason === 'end_turn') {
      // Claude is done - no more tool use
      // Clear conversation history
      conversationHistory.delete(historyKey);

      res.json({
        success: true,
        data: {
          action: { action: 'done' },
          response: textBlock?.type === 'text' ? textBlock.text : 'Task completed',
          sessionId: historyKey,
          done: true
        }
      });
    } else {
      // Text response without tool use
      res.json({
        success: true,
        data: {
          action: null,
          response: textBlock?.type === 'text' ? textBlock.text : 'No action needed',
          sessionId: historyKey
        }
      });
    }
  } catch (error: any) {
    console.error('AI decision error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get AI decision'
    });
  }
});

// Legacy endpoint for backward compatibility
router.post('/ai-decision-legacy', async (req: AuthRequest, res) => {
  try {
    const { screenshot, goal, currentUrl, availableElements, actionHistory, iteration } = req.body;

    if (!screenshot || !goal) {
      return res.status(400).json({
        success: false,
        error: 'screenshot and goal are required'
      });
    }

    // Format action history for context
    const historyContext = Array.isArray(actionHistory) && actionHistory.length > 0
      ? actionHistory.map((a: any, i: number) => `${i + 1}. ${a.action}${a.selector ? ` on ${a.selector}` : ''} → ${a.result}`).join('\n')
      : 'No actions taken yet';

    // Use Claude to decide next action
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
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
            text: `You are a browser automation agent. Your goal: ${goal}

Current page: ${currentUrl}
Iteration: ${iteration || 1}

RECENT ACTIONS (what you already did):
${historyContext}

Available interactive elements:
${JSON.stringify(availableElements, null, 2)}

Based on your previous actions and the current page state, decide the NEXT action. Respond with JSON:
{
  "action": "click" | "type" | "scroll" | "navigate" | "key_press" | "wait",
  "selector": "CSS selector of the element",
  "text": "actual text to type (use real values from the goal, not placeholders)",
  "key": "Enter or Tab (for key_press action)",
  "reasoning": "why this action",
  "done": false | true
}

IMPORTANT RULES:
1. CHECK YOUR RECENT ACTIONS - don't repeat the same action! If you just clicked a field, now TYPE into it.
2. Use ACTUAL values from the goal (e.g., "MARIAODUBER" not "{{USERNAME}}")
3. Workflow: click field → type value → move to next field or submit
4. Set "done": true only when the ENTIRE goal is complete`
          }
        ]
      }]
    });

    if (!Array.isArray(response.content)) {
      throw new Error(`Invalid API response structure`);
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
