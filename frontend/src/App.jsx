import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import Home from './pages/Home/Home';
import WelcomeScreen from './pages/Welcome/WelcomeScreen';
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
        </Route>

        {/* Залогінений юзер: усе, що під /home, доступне лише після входу. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<Home />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
