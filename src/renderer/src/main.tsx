import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initMobileBridge } from './api/mobile-bridge'
import './index.css'

initMobileBridge().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
