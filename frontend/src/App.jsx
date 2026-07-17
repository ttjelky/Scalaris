import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import PasswordResetConfirm from './pages/Auth/PasswordResetConfirm';
import Home from './pages/Home/Home';
import WelcomeScreen from './pages/Welcome/WelcomeScreen';
import Profile from './pages/Profile/Profile';
import BlockedUsers from './pages/BlockedUsers/BlockedUsers';
import Notifications from './pages/Notifications/Notifications';
import DiscordCallback from './pages/OAuth/DiscordCallback';
import './styles/tokens.css';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Незалогінений юзер: Welcome -> Реєстрація/Вхід.
            Якщо він вже залогінений і тицьне сюди напряму — відправляємо в /home. */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/password-reset" element={<PasswordResetConfirm />} />
        </Route>

        {/* Залогінений юзер: усе, що під /home, доступне лише після входу. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/blocked-users" element={<BlockedUsers />} />
          <Route path="/oauth/discord/callback" element={<DiscordCallback />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;