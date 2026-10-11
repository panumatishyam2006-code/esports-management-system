# Esports Tournament Management System (NEXUS)

Full-stack esports tournament web application built with **React + Vite** frontend, **Flask + SQLite** backend, and real-time round-robin matchmaking.

## Run it

### Option 1: Development Server (Hot Reload)
```bash
# Terminal 1 - Backend API:
python3 app.py                  # http://127.0.0.1:5000

# Terminal 2 - React Dev Server:
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

### Option 2: Production Bundle (Single Port)
```bash
cd frontend && npm run build
python3 app.py                  # Open http://127.0.0.1:5000
```
Demo logins: **`organizer`** or **`Kira`** / **`Blaze`** / **`Nova`** (Password: `password123`).

## Structure
```
app.py            Flask backend, REST API endpoints, database schema, points logic
frontend/         React 18 + Vite modern cyberpunk UI
  src/
    App.jsx       Interactive components: tournaments, round fixtures, podium, modals
    App.css       Component styles & micro-animations
    index.css     Dark cyberpunk esports design system
    api.js        REST client with credentials handling
esports.db        SQLite database file
seed.py           Sample tournament and contender seed data
```

## Ideas to extend (good for viva questions)
- CSRF protection (Flask-WTF), password reset, email verification
- Knockout brackets in addition to round-robin
- Tournament edit and delete, player avatars, search and filters
- Deploy to PythonAnywhere or Render
