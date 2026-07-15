import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './goal-app.css'
import { GoalApp } from '../components/goal/GoalApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoalApp />
  </StrictMode>,
)
