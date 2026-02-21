/**
 * React application entry point.
 *
 * Mounts the {@link App} component into the `#root` element inside
 * React StrictMode for development-time double-invoke checks.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './client/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
