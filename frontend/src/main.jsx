import React from 'react'
import ReactDOM from 'react-dom/client'
import AgentApp from './agent/AgentApp'
import './index.css'

// Agent 平台（多项目 / 多 Agent 工作台）。旧的单会话 Studio 仍保留在 ./App.jsx。
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><AgentApp /></React.StrictMode>
)
