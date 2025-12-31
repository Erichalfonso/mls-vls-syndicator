// DOM actions - click, type, scroll, upload, etc.

export interface Action {
  action: 'click' | 'type' | 'scroll' | 'navigate' | 'upload' | 'wait' | 'click_coordinates' | 'type_at_cursor' | 'key_press' | 'mouse_move' | 'noop' | 'click_text';
  selector?: string;
  text?: string;
  filepath?: string;
  url?: string;
  duration?: number;
  x?: number;
  y?: number;
  key?: string;
}

export async function executeAction(action: Action): Promise<any> {
  console.log('Executing action:', action);

  switch (action.action) {
    case 'click':
      return await clickElement(action.selector!, action.x, action.y);

    case 'type':
      // Support both 'value' (from backend) and 'text' for backward compatibility
      return await typeText(action.selector!, action.text || (action as any).value || '');

    case 'scroll':
      return await scrollPage(action.x || 0, action.y || 0);

    case 'navigate':
      return await navigate(action.url!);

    case 'upload':
      return await uploadFile(action.selector!, action.filepath!);

    case 'wait':
      return await wait(action.duration || 1000);

    // Computer Use API actions
    case 'click_coordinates':
      return await clickAtCoordinates(action.x!, action.y!);

    case 'type_at_cursor':
      return await typeAtCursor(action.text!);

    case 'key_press':
      return await pressKey(action.key!);

    case 'mouse_move':
      return await mouseMove(action.x!, action.y!);

    case 'noop':
      return; // No operation

    case 'click_text':
      return await clickByText(action.text!);

    default:
      throw new Error(`Unknown action: ${(action as any).action}`);
  }
}

async function clickElement(selector: string, x?: number, y?: number): Promise<void> {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  // If coordinates provided, click at specific position
  if (x !== undefined && y !== undefined) {
    const rect = element.getBoundingClientRect();
    const clickX = rect.left + x;
    const clickY = rect.top + y;

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickX,
      clientY: clickY
    });
    element.dispatchEvent(event);
  } else {
    // Regular click
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(300);
    element.click();
  }

  console.log(`Clicked: ${selector}`);
}

async function typeText(selector: string, text: string): Promise<void> {
  const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Validate text is a string before iterating
  if (typeof text !== 'string') {
    throw new Error(`Invalid text value: expected string, got ${typeof text}`);
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(300);

  element.focus();
  element.value = '';

  // Type character by character for realistic typing
  for (let char of text) {
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(50); // 50ms between characters
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`Typed into ${selector}: ${text.substring(0, 50)}...`);
}

async function scrollPage(x: number, y: number): Promise<void> {
  window.scrollTo({
    left: x,
    top: y,
    behavior: 'smooth'
  });
  await wait(500);
  console.log(`Scrolled to: ${x}, ${y}`);
}

async function navigate(url: string): Promise<void> {
  window.location.href = url;
  console.log(`Navigating to: ${url}`);
}

async function uploadFile(selector: string, filepath: string): Promise<void> {
  const input = document.querySelector(selector) as HTMLInputElement;
  if (!input || input.type !== 'file') {
    throw new Error(`File input not found: ${selector}`);
  }

  // Scroll to the file input to make it visible
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(500);

  // Click the file input to open the file picker
  // User will manually select the file - this is the consumer-friendly approach
  input.click();

  console.log(`Opened file picker for: ${selector}`);
  console.log(`Note: Please select your file when the dialog opens`);
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickByText(text: string): Promise<void> {
  // Find element containing exact or partial text
  const elements = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick]'));

  for (const el of elements) {
    const element = el as HTMLElement;
    const elementText = element.textContent?.trim() || '';

    if (elementText.toLowerCase().includes(text.toLowerCase())) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(300);
      element.click();
      console.log(`Clicked element with text: "${elementText}"`);
      return;
    }
  }

  throw new Error(`No clickable element found containing text: "${text}"`);
}

// Computer Use API action implementations
async function clickAtCoordinates(x: number, y: number): Promise<void> {
  // Find element at coordinates
  const element = document.elementFromPoint(x, y) as HTMLElement;

  if (!element) {
    throw new Error(`No element found at coordinates: ${x}, ${y}`);
  }

  // Dispatch mouse events at specific coordinates
  const mouseDownEvent = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  const mouseUpEvent = new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  });

  element.dispatchEvent(mouseDownEvent);
  await wait(50);
  element.dispatchEvent(mouseUpEvent);
  await wait(50);
  element.dispatchEvent(clickEvent);

  console.log(`Clicked at coordinates: ${x}, ${y} on element:`, element.tagName);
}

async function typeAtCursor(text: string): Promise<void> {
  // Validate text is a string before iterating
  if (typeof text !== 'string') {
    throw new Error(`Invalid text value: expected string, got ${typeof text}`);
  }

  // Get currently focused element
  const element = document.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement;

  if (!element) {
    throw new Error('No element is focused for typing');
  }

  // Handle different element types
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // For input/textarea elements
    const currentValue = element.value;
    const cursorPos = element.selectionStart || currentValue.length;

    // Insert text at cursor position
    element.value = currentValue.substring(0, cursorPos) + text + currentValue.substring(element.selectionEnd || cursorPos);
    element.selectionStart = element.selectionEnd = cursorPos + text.length;

    // Dispatch events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // For contenteditable elements, dispatch keyboard events
    for (let char of text) {
      const keyDownEvent = new KeyboardEvent('keydown', {
        key: char,
        bubbles: true,
        cancelable: true
      });
      const keyPressEvent = new KeyboardEvent('keypress', {
        key: char,
        bubbles: true,
        cancelable: true
      });
      const keyUpEvent = new KeyboardEvent('keyup', {
        key: char,
        bubbles: true,
        cancelable: true
      });

      element.dispatchEvent(keyDownEvent);
      element.dispatchEvent(keyPressEvent);

      // Insert text using execCommand for contenteditable
      if (element.isContentEditable) {
        document.execCommand('insertText', false, char);
      }

      element.dispatchEvent(keyUpEvent);
      await wait(50);
    }
  }

  console.log(`Typed at cursor: ${text.substring(0, 50)}...`);
}

async function pressKey(key: string): Promise<void> {
  // Get currently focused element or use document
  const element = (document.activeElement || document.body) as HTMLElement;

  // Map common key names
  const keyMap: { [key: string]: string } = {
    'enter': 'Enter',
    'tab': 'Tab',
    'escape': 'Escape',
    'backspace': 'Backspace',
    'delete': 'Delete',
    'space': ' ',
    'return': 'Enter'
  };

  const mappedKey = keyMap[key.toLowerCase()] || key;

  // Dispatch keyboard events
  const keyDownEvent = new KeyboardEvent('keydown', {
    key: mappedKey,
    code: mappedKey,
    bubbles: true,
    cancelable: true
  });

  const keyUpEvent = new KeyboardEvent('keyup', {
    key: mappedKey,
    code: mappedKey,
    bubbles: true,
    cancelable: true
  });

  element.dispatchEvent(keyDownEvent);
  await wait(50);
  element.dispatchEvent(keyUpEvent);

  console.log(`Pressed key: ${mappedKey}`);
}

async function mouseMove(x: number, y: number): Promise<void> {
  // Find element at coordinates
  const element = document.elementFromPoint(x, y) as HTMLElement;

  if (element) {
    // Dispatch mousemove event
    const mouseMoveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });

    element.dispatchEvent(mouseMoveEvent);
    console.log(`Mouse moved to: ${x}, ${y}`);
  }
}

// Helper: Generate robust selector for an element
export function generateSelector(element: Element): string {
  // Try ID first
  if (element.id) {
    return `#${element.id}`;
  }

  // Try unique class combination
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c);
    if (classes.length > 0) {
      const selector = '.' + classes.join('.');
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Fallback to nth-child path
  let path = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children);
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}
