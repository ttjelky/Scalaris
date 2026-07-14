import { useUsers } from '../../hooks/useUsers';

function Users() {
  const { users, loading, error } = useUsers();

  if (loading) return <p>Завантаження...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>Користувачі</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.username} ({u.email || 'без email'})</li>
        ))}
      </ul>
    </div>
  );
}

export default Users;