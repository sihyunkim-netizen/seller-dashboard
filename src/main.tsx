import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import AdminPage from './AdminPage.tsx'
import AdminAuth from './components/AdminAuth.tsx'
import SellerAuth from './components/SellerAuth.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SellerAuth><App /></SellerAuth>} />
        <Route path="/admin" element={<AdminAuth><AdminPage /></AdminAuth>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
