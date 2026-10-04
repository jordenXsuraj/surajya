
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
import Onboard from './pages/Onboard'
import Home from './pages/Home'
import Post from './pages/Post'
import Connect from './pages/Connect'
import Profile from './pages/Profile'
import StudentProfile from './pages/StudentProfile'
import ConnectionFeed from './pages/ConnectionFeed'
 import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Admin from './pages/Admin'
import SinglePost from './pages/SinglePost'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import DeleteAccount from './pages/DeleteAccount'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import CommunityGuidelines from './pages/CommunityGuidelines'
function Guard({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/" replace />
}

function AppShell() {



const { pathname } = useLocation()

useEffect(() => {
  window.scrollTo(0, 0)
}, [pathname])

  const { user } = useAuth()
  return (
    <div className="shell">
      <Routes>
        <Route path="/" element={user ? <Navigate to="/home" /> : <Onboard />} />
        <Route path="/home"        element={<Guard><Home /></Guard>} />
        <Route path="/feed" element={<Guard><ConnectionFeed /></Guard>} />
        <Route path="/post"        element={<Guard><Post /></Guard>} />
        <Route path="/connect"     element={<Guard><Connect /></Guard>} />
        <Route path="/profile"     element={<Guard><Profile /></Guard>} />
        <Route path="/profile/:id" element={<Guard><StudentProfile /></Guard>} />
        <Route path="/post/:id" element={<SinglePost />} />
        <Route path="/admin" element={<Admin />} />
        {/* Public: account recovery, deletion and legal pages (linked from the app stores) */}
        <Route path="/forgot-password"      element={<ForgotPassword />} />
        <Route path="/reset-password"       element={<ResetPassword />} />
        <Route path="/delete-account"       element={<DeleteAccount />} />
        <Route path="/terms"                element={<Terms />} />
        <Route path="/privacy"              element={<Privacy />} />
        <Route path="/community-guidelines" element={<CommunityGuidelines />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
      {user && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}