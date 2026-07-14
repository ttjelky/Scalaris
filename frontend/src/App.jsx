import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/users/')
      .then((res) => {
        if (!res.ok) throw new Error('Помилка запиту до API');
        return res.json();
      })
      .then((data) => setUsers(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Scalaris</h1>
      <h2>Користувачі з Django API:</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.username} ({u.email || 'без email'})</li>
        ))}
      </ul>
    </div>
  );
}

export default App;