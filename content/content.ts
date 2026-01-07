// Content script - runs in the page context
// Handles DOM manipulation and screenshots

import { executeAction } from './actions';
import { takeScreenshot } from './screenshot';
import { createOverlay, showOverlay, hideOverlay, updateOverlayStatus, addOverlayMessage, clearOverlayMessages } from './overlay';
import { inspectPage } from './dom-inspector';

// Error logging for debugging
const errorLog: Array<{ type: string; message: string; timestamp: number }> = [];
const MAX_ERRORS = 20;

// Capture console errors
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  errorLog.push({
    type: 'console.error',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  });
  if (errorLog.length > MAX_ERRORS) errorLog.shift();
  originalConsoleError.apply(console, args);
};

// Capture console warnings
const originalConsoleWarn = console.warn;
console.warn = function(...args: any[]) {
  errorLog.push({
    type: 'console.warn',
    message: args.map(a => String(a)).join(' '),
    timestamp: Date.now()
  });
  if (errorLog.length > MAX_ERRORS) errorLog.shift();
  originalConsoleWarn.apply(console, args);
};

// Capture unhandled errors
window.addEventListener('error', (event) => {
  errorLog.push({
    type: 'error',
    message: `${event.message} at ${event.filename}:${event.lineno}`,
    timestamp: Date.now()
  });
  if (errorLog.length > MAX_ERRORS) errorLog.shift();
});

// Capture network errors
window.addEventListener('unhandledrejection', (event) => {
  errorLog.push({
    type: 'promise_rejection',
    message: String(event.reason),
    timestamp: Date.now()
  });
  if (errorLog.length > MAX_ERRORS) errorLog.shift();
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.type === 'take_screenshot') {
        const screenshot = await takeScreenshot();
        sendResponse({ success: true, data: screenshot });
      }
      else if (request.type === 'execute_action') {
        const result = await executeAction(request.action);
        sendResponse({ success: true, result });
      }
      else if (request.type === 'get_page_info') {
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
        sendResponse({ success: true, data: pageInfo });
      }
      else if (request.type === 'get_error_logs') {
        // Return recent errors for debugging
        const recentErrors = errorLog.slice(-10); // Last 10 errors
        sendResponse({ success: true, data: recentErrors });
      }
      else if (request.type === 'clear_error_logs') {
        // Clear error log
        errorLog.length = 0;
        sendResponse({ success: true });
      }
      else if (request.type === 'update_overlay') {
        // Update overlay status
        showOverlay();
        updateOverlayStatus(request.status, request.progress);
        sendResponse({ success: true });
      }
      else if (request.type === 'add_overlay_message') {
        // Add message to overlay
        showOverlay();
        addOverlayMessage(request.message, request.messageType);
        sendResponse({ success: true });
      }
      else if (request.type === 'hide_overlay') {
        // Hide overlay
        hideOverlay();
        sendResponse({ success: true });
      }
      else if (request.type === 'show_overlay') {
        // Show overlay
        showOverlay();
        clearOverlayMessages();
        sendResponse({ success: true });
      }
      else if (request.type === 'inspect_page') {
        // Inspect page DOM for reasoning
        const inspection = inspectPage();
        sendResponse({ success: true, data: inspection });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true; // Keep message channel open for async response
});

// Notify background that content script is ready
chrome.runtime.sendMessage({ type: 'content_ready' });

console.log('Claude Browser Agent: Content script loaded');
