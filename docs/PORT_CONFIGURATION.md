# ZyFlow Port Configuration

## Default Ports

| Service | Default Port | Environment Variable |
|---------|--------------|---------------------|
| Frontend (Vite) | 3200 | `VITE_PORT` |
| Backend (Express) | 3100 | `API_PORT` |

## Configuration Methods

### Method 1: Environment Variables (Recommended)

Add to your `.env` file:

```bash
# Frontend dev server port (Vite)
VITE_PORT=3200

# Backend API server port (Express)
API_PORT=3100
```

### Method 2: Inline Command

```bash
# Custom ports
VITE_PORT=4200 API_PORT=4100 npm start

# Or just change one
API_PORT=5000 npm start
```

### Method 3: Export in Shell

```bash
export VITE_PORT=3200
export API_PORT=3100
npm start
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Kill existing processes and start both servers |
| `npm run dev:all` | Same as `npm start` |
| `npm run server` | Start backend only |
| `npm run dev` | Start frontend only |
| `npm run start:build` | Build and start backend (production mode) |
| `npm run kill:ports` | Kill processes on ports 3100 and 3200 |

## Files Modified

- `vite.config.ts` - Uses `VITE_PORT` and `API_PORT`
- `server/index.ts` - Uses `API_PORT` or `PORT`
- `config/ports.ts` - Central port configuration module
