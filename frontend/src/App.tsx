import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PrivateRoute } from './components/PrivateRoute'
import { AuthProvider } from './contexts/AuthContext'
import { AppLayout } from './layouts/AppLayout'
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  RoleHomePage,
} from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { FeaturePage } from './pages/FeaturePages'
import { NotFoundPage } from './pages/NotFoundPage'

function ProtectedFeature({ module }: { module: Parameters<typeof FeaturePage>[0]['module'] }) {
  return (
    <PrivateRoute>
      <FeaturePage module={module} />
    </PrivateRoute>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="cadastro" element={<RegisterPage />} />
            <Route path="recuperar-senha" element={<ForgotPasswordPage />} />
            <Route path="redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="ideias" element={<ProtectedFeature module="ideas" />} />
            <Route path="desafios" element={<ProtectedFeature module="challenges" />} />
            <Route path="agenda" element={<ProtectedFeature module="agenda" />} />
            <Route path="midia-jovem" element={<ProtectedFeature module="youth-media" />} />
            <Route path="maker" element={<ProtectedFeature module="maker" />} />
            <Route path="ods" element={<ProtectedFeature module="ods" />} />
            <Route path="ranking" element={<ProtectedFeature module="ranking" />} />
            <Route path="mentora" element={<ProtectedFeature module="mentor" />} />
            <Route path="equipes" element={<ProtectedFeature module="teams" />} />
            <Route path="feira" element={<ProtectedFeature module="fairs" />} />
            <Route path="notificacoes" element={<ProtectedFeature module="notifications" />} />
            <Route
              path="painel/:role"
              element={
                <PrivateRoute>
                  <RoleHomePage />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
