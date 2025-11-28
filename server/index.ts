import { app } from './app.js'

const PORT = 3001

app.listen(PORT, () => {
  console.log(`ZyFlow API server running on http://localhost:${PORT}`)
})
