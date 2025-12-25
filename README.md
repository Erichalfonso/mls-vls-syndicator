# Claude Browser Agent 🤖

AI-powered browser automation using Claude's vision and reasoning capabilities. Tell it what you want to do on a webpage, and it figures out how to do it.

## Features

- ✅ **Natural language commands** - "Fill out this login form with my credentials"
- ✅ **Vision + reasoning** - Screenshots page, Claude Opus 4.5 decides next action
- ✅ **Extended thinking** - 5000 token reasoning budget for complex tasks
- ✅ **DOM inspection** - Sees all available buttons, inputs, and links
- ✅ **Smart error recovery** - Console log debugging when things fail
- ✅ **Persistent side panel** - Stays open while browsing
- ✅ **Full automation** - Click, type, scroll, navigate, file uploads
- ✅ **No setup required** - Install and go!

## Demo Commands

```
"Login with username 'john@example.com' and password 'mypassword'"
"Fill out this contact form with my information"
"Click on 'Add to Cart' and proceed to checkout"
"Navigate to the pricing page and click on the Pro plan"
"Find the file upload button and click it for me"
```

---

## Quick Start

### 1. Install Dependencies

```bash
cd C:\Users\erich\claude-browser-agent
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This creates the `dist/` folder with the built extension.

### 3. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `C:\Users\erich\claude-browser-agent\dist` folder

### 4. Add Your Claude API Key

1. Click the extension icon in Chrome
2. Click the ⚙️ settings button
3. Enter your Claude API key (get one at https://console.anthropic.com/)
4. Click "Save"

---

## Usage

1. **Navigate to any webpage**
2. **Click the extension icon**
3. **Tell it what to do:**

```
"Fill in the contact form with:
Name: John Doe
Email: john@example.com
Message: Hello!"
```

```
"Click the file upload button and I'll select my resume"
```

```
"Scroll down and click the 'Load More' button until you see products under $50"
```

4. **Watch it work!**

The agent will:
- Take a screenshot
- Ask Claude what to do next
- Execute the action
- Repeat until done

---

## Project Structure

```
claude-browser-agent/
├── manifest.json              # Chrome extension config
├── package.json               # NPM dependencies
├── webpack.config.js          # Build configuration
├── tsconfig.json              # TypeScript config
│
├── popup/                     # Extension UI
│   ├── popup.html
│   ├── popup.tsx             # React component
│   └── styles.css
│
├── background/                # Agent brain
│   └── service-worker.ts     # Agent loop + Claude API
│
├── content/                   # Page interaction
│   ├── content.ts            # Message handler
│   ├── actions.ts            # Click, type, scroll, upload
│   ├── screenshot.ts         # Screenshot capture
│   ├── dom-inspector.ts      # Page element detection
│   └── overlay.ts            # Status overlay
│
└── dist/                      # Built extension (after npm run build)
```

---

## How It Works

### Agent Loop

```javascript
while (not done) {
  1. Take screenshot of current page
  2. Send screenshot + goal to Claude
  3. Claude responds with next action (JSON)
  4. Execute action on page
  5. Wait 1.5 seconds
  6. Repeat
}
```

### Claude Prompt

```
"You are a browser automation agent. Goal: [user's request]

Current page: [URL]
Screenshot: [image]

What's the next action? Respond with JSON:
{
  "action": "click" | "type" | "scroll" | "navigate" | "upload",
  "selector": "CSS selector",
  "text": "text to type",
  "filepath": "C:\\path\\to\\file.pdf",
  "reasoning": "why this action",
  "done": false | true
}
"
```

### File Upload Flow

```
1. User says: "Click the upload button for my resume"
2. Agent identifies file input: <input type="file">
3. Agent clicks the file input
4. Standard browser file picker opens
5. User selects their file
6. ✅ File ready to upload!
```

---

## Development

### Watch Mode

```bash
npm run dev
```

Webpack will watch for changes and rebuild automatically.

### Reload Extension

After rebuilding:
1. Go to `chrome://extensions/`
2. Click the refresh icon on your extension

### Debugging

- **Side panel**: Right-click extension icon → "Inspect"
- **Background**: `chrome://extensions/` → "Inspect views: service worker"
- **Content script**: F12 on any page, check Console

---

## Configuration

### Change Claude Model

Edit `background/service-worker.ts`:
```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514', // or 'claude-opus-4-5-20251101'
  max_tokens: 1024,
  messages
});
```

### Adjust Iteration Limit

Edit `background/service-worker.ts`:
```typescript
const MAX_ITERATIONS = 20; // Change this
```

### Change Wait Time

Edit `background/service-worker.ts`:
```typescript
await wait(1500); // Milliseconds between actions
```

---

## Troubleshooting

### "Failed to capture screenshot"

- Extension needs `activeTab` permission (should be in manifest)
- Make sure you're on a real webpage (not chrome:// pages)

### "Element not found"

- Claude might have generated an incorrect selector
- Page might have changed between screenshot and action
- Try increasing wait time between actions

### Agent Keeps Repeating

- Claude might be stuck in a loop
- Try being more specific in your request
- May need to manually stop and restart

---

## Limitations

- Maximum 20 iterations per run (to prevent infinite loops)
- Only works on `http://` and `https://` pages
- Cannot interact with Chrome internal pages (`chrome://`)
- Screenshot is visible viewport only (not full page)
- File uploads require user to manually select files from the file picker

---

## Future Improvements

- [ ] Workflow recording/replay (run workflows without API calls)
- [ ] Better selector generation (currently uses simple CSS)
- [ ] Full page screenshots with html2canvas
- [ ] User accounts + cloud storage for workflows
- [ ] Team collaboration features
- [ ] Automatic retry on failure
- [ ] Better error messages
- [ ] Visual feedback on page (highlight elements before clicking)

---

## Tech Stack

**Extension:**
- TypeScript
- React 18
- Chrome Manifest V3
- Webpack 5

**AI:**
- Claude Opus 4.5 (Anthropic)
- Extended Thinking (5000 tokens)

**APIs:**
- Chrome Extensions API
- Chrome Tabs API
- Chrome Side Panel API
- Claude Messages API

---

## License

MIT

---

## Support

For issues, check:
1. Chrome console (F12) on the page
2. Extension service worker console (`chrome://extensions/`)
3. Side panel console (right-click extension icon → Inspect)

---

## Credits

Built with ❤️ using Claude Sonnet 4.5

Inspired by the need to automate boring web tasks!
