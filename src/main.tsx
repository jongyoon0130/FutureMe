import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './goals/goal-app.css'
import './index.css'
import { initTheme } from './lib/themes'
import { registerNotifyWorker } from './lib/notify'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'

initTheme()

// 알림 수신기 등록 — 실패해도 앱은 그대로 돌아간다 (알림만 못 받을 뿐)
void registerNotifyWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
