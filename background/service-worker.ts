// Background service worker - agent brain
// Coordinates screenshots, backend API calls, and action execution

import { CONFIG } from '../config';

const BACKEND_URL = CONFIG.BACKEND_URL;

interface AgentState {
  running: boolean;
  goal: string | null;
  authToken: string | null;
  workflowId: number | null;
  tabId: number | null;
  messageHistory: any[];
  lastMouseX: number;
  lastMouseY: number;
  actionHistory: Array<{ action: string; selector?: string; result: string }>;
  currentStep: number;
}

const state: AgentState = {
  running: false,
  goal: null,
  authToken: null,
  workflowId: null,
  tabId: null,
  messageHistory: [],
  lastMouseX: 0,
  lastMouseY: 0,
  actionHistory: [],
  currentStep: 0
};

// Set side panel behavior on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Open side panel when extension icon is clicked (tab-specific)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // Enable side panel for this specific tab
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'popup/popup.html',
    enabled: true
  });

  // Open it
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Disable side panel when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.sidePanel.setOptions({
    tabId: tabId,
    enabled: false
  }).catch(() => {
    // Tab already removed, ignore error
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.type === 'run_agent') {
        await runAgent(request.goal, request.authToken);
        sendResponse({ success: true });
      }
      else if (request.type === 'stop_agent') {
        stopAgent();
        sendResponse({ success: true });
      }
      else if (request.type === 'capture_screenshot') {
        const screenshot = await captureScreenshot();
        sendResponse({ success: true, data: screenshot });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true; // Keep channel open for async
});

// Check if user is just asking a question (not requesting automation)
function isJustAQuestion(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();

  // Greetings without tasks
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)[\s!.]*$/i.test(lowerMessage)) {
    return true;
  }

  // Pure questions about the extension itself
  const questionPatterns = [
    /^what can you do/i,
    /^what are you/i,
    /^who are you/i,
    /^how do you work/i,
    /^what is this/i,
    /^help$/i,
    /^how does this work/i,
  ];

  if (questionPatterns.some(pattern => pattern.test(lowerMessage))) {
    return true;
  }

  // If message contains action verbs, it's a task request
  const actionVerbs = [
    'login', 'log in', 'sign in', 'signin',
    'click', 'press', 'tap', 'select',
    'fill', 'enter', 'type', 'input', 'write',
    'submit', 'send', 'post', 'upload',
    'add', 'create', 'make', 'build',
    'go to', 'navigate', 'open', 'visit',
    'find', 'search', 'look for',
    'download', 'save', 'export',
    'figure out', 'learn', 'teach', 'show me'
  ];

  if (actionVerbs.some(verb => lowerMessage.includes(verb))) {
    return false; // It's a task, not just a question
  }

  // Short vague messages might be questions
  if (lowerMessage.length < 15 && !lowerMessage.includes('workflow')) {
    return true;
  }

  // Default: assume it's a task (the extension is for automation after all)
  return false;
}

async function runAgent(goal: string, authToken: string) {
  if (state.running) {
    throw new Error('Agent is already running');
  }

  // Check if this is just a question/greeting (not a task)
  if (isJustAQuestion(goal)) {
    sendMessageToPopup({
      type: 'agent_message',
      content: `I'm your browser automation assistant! Tell me what you want me to do on this page and I'll learn how to do it.\n\nFor example:\n• "Login with username X and password Y"\n• "Fill out this form and submit it"\n• "Add a new listing with these details"\n\nJust describe the task naturally and I'll figure it out!`
    });
    return;
  }

  state.running = true;
  state.goal = goal;
  state.authToken = authToken;
  state.messageHistory = [];
  state.lastMouseX = 0;
  state.lastMouseY = 0;
  state.actionHistory = [];
  state.currentStep = 0;

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    throw new Error('No active tab found');
  }

  // Check if tab URL is accessible
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    throw new Error('Cannot automate on browser internal pages. Please navigate to a regular website (http:// or https://)');
  }

  state.tabId = tab.id;

  // Create workflow on backend
  updateStatus('Creating workflow...', 'Setting up AI learning mode');
  try {
    // Extract a clean workflow name from the goal
    let workflowName = goal
      .replace(/create\s*(a\s*)?workflow\s*(to|for)?/i, '')
      .replace(/automate\s*/i, '')
      .replace(/learn\s*how\s*to\s*/i, '')
      .trim();

    if (workflowName.length < 5) {
      workflowName = goal;
    }
    workflowName = workflowName.charAt(0).toUpperCase() + workflowName.slice(1);
    if (workflowName.length > 50) {
      workflowName = workflowName.substring(0, 50) + '...';
    }

    const workflowResponse = await fetch(`${BACKEND_URL}/api/workflows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: workflowName,
        description: goal,
        website: tab.url
      })
    });

    const workflowData = await workflowResponse.json();
    if (!workflowData.success) {
      throw new Error(workflowData.error || 'Failed to create workflow');
    }

    state.workflowId = workflowData.data.workflow.id;
    updateStatus('Workflow created', `"${workflowName}"`);

    sendMessageToPopup({
      type: 'agent_message',
      content: `📝 Created workflow: "${workflowName}"\n\nI'll now learn how to do this task. Watch as I analyze the page and perform actions.`
    });
  } catch (error) {
    throw new Error(`Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Ensure content script is loaded
  try {
    await sendMessageToTab(state.tabId, { type: 'get_page_info' });
    // Clear any previous error logs
    await sendMessageToTab(state.tabId, { type: 'clear_error_logs' }).catch(() => {});
  } catch (error) {
    // Content script not loaded, try to inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: state.tabId },
        files: ['content/content.js']
      });
      // Wait a bit for it to load
      await wait(500);
    } catch (injectError) {
      throw new Error('Failed to load automation script on this page. Try refreshing the page.');
    }
  }

  updateStatus('Starting agent...', 'Analyzing page');

  // Show overlay on page
  try {
    await sendMessageToTab(state.tabId, { type: 'show_overlay' });
  } catch (error) {
    console.log('Could not show overlay:', error);
  }

  try {
    // Agent loop
    let iteration = 0;
    const MAX_ITERATIONS = 50; // Increased for complex multi-step workflows

    while (state.running && iteration < MAX_ITERATIONS) {
      iteration++;

      // Take screenshot
      updateStatus('Taking screenshot...', `Iteration ${iteration}/${MAX_ITERATIONS}`);
      const screenshot = await captureScreenshot();

      // Get page info and DOM inspection for better reasoning
      const pageInfo = await sendMessageToTab(state.tabId, { type: 'get_page_info' });
      const domInspection = await sendMessageToTab(state.tabId, { type: 'inspect_page' });

      // Call backend AI decision endpoint
      updateStatus('Thinking...', 'Analyzing page and reasoning about next action');

      let response;
      let retries = 0;
      const MAX_RETRIES = 3;

      while (retries < MAX_RETRIES) {
        try {
          const aiResponse = await fetch(`${BACKEND_URL}/api/extension/ai-decision`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${state.authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              screenshot,
              goal,
              currentUrl: pageInfo.data.url,
              availableElements: Array.isArray(domInspection.data?.elements) ? domInspection.data.elements : [],
              iteration,
              actionHistory: Array.isArray(state.actionHistory) ? state.actionHistory.slice(-5) : []
            })
          });

          const aiData = await aiResponse.json();
          if (!aiData.success) {
            throw new Error(aiData.error || 'AI decision failed');
          }

          response = aiData.data;
          break; // Success, exit retry loop
        } catch (apiError: any) {
          retries++;
          console.error(`API error (attempt ${retries}/${MAX_RETRIES}):`, apiError);

          if (retries >= MAX_RETRIES) {
            throw new Error(`API failed after ${MAX_RETRIES} attempts: ${apiError.message || String(apiError)}`);
          }

          // Wait before retry (exponential backoff)
          updateStatus('API error, retrying...', `Attempt ${retries}/${MAX_RETRIES}`);
          await wait(1000 * Math.pow(2, retries)); // 2s, 4s, 8s
        }
      }

      // Parse response
      if (!response) {
        throw new Error('No response from API');
      }

      console.log('AI Response:', JSON.stringify(response, null, 2));

      const textResponse = response.response || '';
      const action = response.action || null;

      // Debug: log what action we got
      console.log('Parsed action:', action);
      if (!action || !action.action) {
        console.log('WARNING: No valid action in response');
      }

      // Send text response to popup and overlay for visibility
      if (textResponse) {
        sendMessageToPopup({
          type: 'agent_message',
          content: textResponse
        });

        // Add to overlay
        sendMessageToTab(state.tabId, {
          type: 'add_overlay_message',
          message: textResponse.substring(0, 200) + (textResponse.length > 200 ? '...' : ''),
          messageType: 'agent'
        }).catch(() => {});
      }

      // Check if task is done
      if (textResponse.toLowerCase().includes('task complete') ||
          textResponse.toLowerCase().includes('finished') ||
          !action) {
        break;
      }

      // Execute action
      let actionSuccess = false;
      try {
        // Show reasoning in overlay
        if (action.reasoning) {
          sendMessageToTab(state.tabId, {
            type: 'add_overlay_message',
            message: `💭 ${action.reasoning}`,
            messageType: 'agent'
          }).catch(() => {});
        }

        console.log(`Executing action: ${action.action} on ${action.selector || 'N/A'}`);
        updateStatus(
          `Executing: ${action.action}`,
          action.selector || action.reasoning || ''
        );

        // Execute the action
        await executeActionOnTab(state.tabId, action);
        actionSuccess = true;
        console.log('Action executed successfully');

        // Record action to backend
        try {
          await fetch(`${BACKEND_URL}/api/extension/record-action`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${state.authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              workflowId: state.workflowId,
              action
            })
          });
        } catch (recordError) {
          console.error('Failed to record action:', recordError);
          // Continue anyway - action was executed successfully
        }

        // Record action in local history
        state.actionHistory.push({
          action: action.action,
          selector: action.selector,
          result: 'success'
        });
        if (state.actionHistory.length > 10) {
          state.actionHistory.shift(); // Keep last 10
        }

        state.currentStep++;

      } catch (error) {
        const errorMessage = `Action failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error('Action execution failed:', error);
        console.error('Failed action was:', JSON.stringify(action, null, 2));

        // Record failed action in local history
        state.actionHistory.push({
          action: action?.action || 'unknown',
          selector: action?.selector,
          result: `failed: ${error instanceof Error ? error.message : String(error)}`
        });
        if (state.actionHistory.length > 10) {
          state.actionHistory.shift();
        }

        // Send error to popup with more detail
        sendMessageToPopup({
          type: 'agent_message',
          content: `❌ ${errorMessage} (tried: ${action?.action} on ${action?.selector || 'unknown'})`
        });

        iteration--; // Don't count failed attempts
      }

      // Wait between actions
      await wait(1500);
    }

    if (iteration >= MAX_ITERATIONS) {
      sendMessageToPopup({
        type: 'agent_message',
        content: 'Reached maximum iterations. Task may not be complete.'
      });
    }

  } catch (error) {
    console.error('Agent error:', error);
    sendMessageToPopup({
      type: 'agent_message',
      content: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
  } finally {
    stopAgent();
  }
}

function stopAgent() {
  state.running = false;
  state.goal = null;
  state.messageHistory = []; // Clear conversation history
  state.actionHistory = []; // Clear action history
  updateStatus('Agent stopped', 'Click X to close', false);

  // Keep overlay visible for a moment, then auto-hide after 3 seconds
  if (state.tabId) {
    setTimeout(() => {
      sendMessageToTab(state.tabId!, {
        type: 'update_overlay',
        status: 'Completed',
        progress: 'You can close this panel'
      }).catch(() => {});
    }, 1000);
  }
}

function buildPrompt(goal: string, pageInfo: any, domInspection: any, iteration: number): string {
  // Format available elements for reasoning
  const elementsContext = domInspection.data?.elements?.map((el: any) => {
    if (el.type === 'input') {
      return `  - ${el.tag}[type="${el.inputType}"] (${el.selector})${el.label ? ` - Label: "${el.label}"` : ''}${el.placeholder ? ` - Placeholder: "${el.placeholder}"` : ''}`;
    } else if (el.type === 'button') {
      return `  - Button: "${el.text}" (${el.selector})`;
    } else if (el.type === 'link') {
      return `  - Link: "${el.text}" → ${el.href}`;
    }
    return null;
  }).filter(Boolean).join('\n') || '  (No interactive elements found)';

  // Format recent action history
  const recentActions = state.actionHistory.slice(-5).map((a, idx) =>
    `  ${idx + 1}. ${a.action}${a.selector ? ` on ${a.selector}` : ''} → ${a.result}`
  ).join('\n') || '  (No previous actions)';

  return `You are an intelligent browser automation agent. Your task: ${goal}

## Current State
Page: ${pageInfo.data.url}
Title: ${pageInfo.data.title}
Iteration: ${iteration}/50

## Available Interactive Elements
${elementsContext}

## Recent Actions History
${recentActions}

## Your Reasoning Process
Before responding, think through:
1. What is my current objective? (What's the next logical step toward the goal?)
2. What do I see on the page? (Analyze the screenshot)
3. What elements are available? (Check the list above)
4. What did I just do? (Check recent actions)
5. What should I do next? (Choose the best action)

## Response Format
Return ONLY valid JSON with your reasoning:

{
  "reasoning": "I see the login page. I need to enter credentials. I can see input[name='username'] is available. My recent actions show I haven't filled this yet, so I should click it first to focus it.",
  "action": "click",
  "selector": "input[name='username']"
}

OR

{
  "reasoning": "The username field is now focused (I clicked it last iteration). I should type the username MARIAODUBER into it.",
  "action": "type",
  "selector": "input[name='username']",
  "text": "MARIAODUBER"
}

OR

{
  "reasoning": "I've filled both username and password. I can see a submit button. I should press Enter or click the submit button to log in.",
  "action": "key_press",
  "key": "Enter"
}

## Available Actions
- click: Click an element using CSS selector
- click_text: Click an element by its visible text (fallback if selector not available)
- type: Type text into an element
- scroll: Scroll the page (x, y pixels)
- navigate: Go to URL
- key_press: Press a key (Enter, Tab, etc.)
- wait: Wait (duration in ms)

## Fallback Strategy
If you can't find a selector for an element, use click_text:
{
  "reasoning": "I can't find the exact selector for 'Add Listing' in the available elements list, but I can see it in the screenshot. I'll use click_text to find and click it by its visible text.",
  "action": "click_text",
  "text": "Add Listing"
}

## Important
- Use selectors from the "Available Interactive Elements" list above
- Include detailed "reasoning" explaining your thought process
- Take ONE action per response
- Only mark as "complete" when the ENTIRE task is finished (not just one step)
  - Read the full task carefully: "${goal}"
  - Complete ALL parts of the task before marking complete
  - Example: If task says "login AND add listing AND upload images", don't complete after just login

Think step-by-step and be thorough in your reasoning.`;
}

function extractAction(text: string): any {
  try {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('Failed to parse action:', text);
    throw new Error('Failed to parse Claude response as JSON');
  }
}

function convertComputerUseToDomAction(action: string, input: any): any {
  switch (action) {
    case 'mouse_move':
      // Store mouse position for next click
      state.lastMouseX = input.coordinate?.[0] || 0;
      state.lastMouseY = input.coordinate?.[1] || 0;
      return {
        action: 'mouse_move',
        x: state.lastMouseX,
        y: state.lastMouseY
      };

    case 'left_click':
      // Click at current mouse position (or provided coordinates)
      const clickX = input.coordinate?.[0] || state.lastMouseX;
      const clickY = input.coordinate?.[1] || state.lastMouseY;
      return {
        action: 'click_coordinates',
        x: clickX,
        y: clickY
      };

    case 'type':
      // Type text at current cursor position
      return {
        action: 'type_at_cursor',
        text: input.text || ''
      };

    case 'key':
      // Press a key (enter, tab, etc)
      return {
        action: 'key_press',
        key: input.text || ''
      };

    case 'screenshot':
      // Screenshot is handled automatically each iteration
      return {
        action: 'noop'
      };

    default:
      throw new Error(`Unknown computer action: ${action}`);
  }
}

async function captureScreenshot(): Promise<string> {
  if (!state.tabId) {
    throw new Error('No tab selected');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      }
    );
  });
}

async function sendMessageToTab(tabId: number, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Tab message failed'));
      }
    });
  });
}

async function executeActionOnTab(tabId: number, action: any): Promise<void> {
  await sendMessageToTab(tabId, {
    type: 'execute_action',
    action
  });
}

function sendMessageToPopup(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, ignore error
  });
}

function updateStatus(currentAction: string, progress: string, running: boolean = true) {
  // Update popup
  sendMessageToPopup({
    type: 'status_update',
    status: {
      running,
      currentAction,
      progress
    }
  });

  // Update overlay on page
  if (state.tabId) {
    sendMessageToTab(state.tabId, {
      type: 'update_overlay',
      status: currentAction,
      progress: progress
    }).catch(() => {
      // Ignore errors (overlay might not be loaded)
    });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Claude Browser Agent: Service worker loaded');
