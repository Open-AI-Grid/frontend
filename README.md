# Open AI Grid Frontend

Web dashboard for Open AI Grid users.

This frontend provides:
- node metrics and GPU telemetry
- model visibility and model selection
- task submission (LLM + data processing)
- authentication UI (register/login/MFA)
- personal contribution stats
- global leaderboard view

## Quick Start

This is a static frontend.

### Option A: Open directly

Open `index.html` in your browser.

### Option B: Serve locally (recommended)

```bash
cd open-ai-grid-frontend
python -m http.server 8080
```

Then open:
- `http://localhost:8080`

## Service Dependencies

By default, the app expects:
- Node API: `http://localhost:9000`
- Auth API: `http://localhost:8800`

You can override in browser before app boot:

```html
<script>
  window.NODE_API = "http://localhost:9000";
  window.AUTH_API = "http://localhost:8800";
</script>
```

## Core Files

- `index.html` - layout and auth modal
- `styles.css` - dashboard styling
- `app.js` - API calls and UI logic

## User Flows

- Register account
- Login (with MFA prompt when enabled)
- Submit tasks
- See own stats (tasks/time/tokens/rank)
- View leaderboard and peer/node status

## Versioning

- Version source of truth: `VERSION`
