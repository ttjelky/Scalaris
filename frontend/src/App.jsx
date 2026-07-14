import { useEffect, useState } from 'react';
import Users from './components/Users/Users';


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
      <div>
        <h1>Scalaris</h1>
        <Users />
      </div>
    </div>
  );
}

export default App;