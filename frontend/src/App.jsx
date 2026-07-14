import { Routes, Route } from 'react-router-dom';
import WelcomeScreen from './pages/Welcome/WelcomeScreen';

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomeScreen />} />
    </Routes>
  );
}

export default App;