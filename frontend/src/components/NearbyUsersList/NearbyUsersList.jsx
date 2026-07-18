import { Link } from 'react-router-dom';
// Shares BottomSheet's stylesheet — see the note at the top of
// BottomSheet.jsx for why these classes aren't split into their own file.
import styles from '../BottomSheet/BottomSheet.module.css';

export default function NearbyUsersList({ nearbyUsersFiltered, friendsOnly, sheetState }) {
  return (
    <>
      <p className={styles.heroText}>
        Радіус 5 км. Приєднуйся до когось поруч або чекай, поки хтось приєднається до тебе.
      </p>

      <div className={styles.userList} key={sheetState}>
        {nearbyUsersFiltered.length === 0 ? (
          <div className={styles.emptyState}>
            {friendsOnly
              ? 'Немає друзів поруч. Спробуй вимкнути фільтр.'
              : 'Поки що нікого поруч немає. Спробуй вийти на вулицю — карта оновиться сама.'}
          </div>
        ) : (
          nearbyUsersFiltered.map((person) => (
            <Link className={styles.userCard} key={person.id} to={`/profile/${person.id}`}>
              {person.avatar ? (
                <img src={person.avatar} alt="" className={styles.userAvatarImg} />
              ) : (
                <div className={styles.userAvatar}>{person.username?.slice(0, 1).toUpperCase()}</div>
              )}
              <div className={styles.userMeta}>
                <div className={styles.userName}>{person.username}</div>
                <div className={styles.userStatus}>{person.is_online ? 'онлайн' : 'був(ла) нещодавно'}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
