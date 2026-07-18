import { DiscordIcon } from './icons';
import styles from './SocialLinksSection.module.css';

export default function SocialLinksSection({
  discordUsername,
  socialError,
  discordUnlinking,
  onConnectDiscord,
  onDisconnectDiscord,
}) {
  return (
    <div className={styles.socialSection}>
      <span className={styles.label}>Соцмережі</span>

      {socialError && (
        <p className={styles.formError} role="alert">
          {socialError}
        </p>
      )}

      <div className={styles.socialChipsRow}>
        {discordUsername ? (
          <span className={`${styles.socialChip} ${styles.socialChipConnected}`}>
            <span className={`${styles.socialChipIcon} ${styles.socialChipIconDiscord}`} aria-hidden="true">
              <DiscordIcon />
            </span>
            <span className={styles.socialChipLabel}>{discordUsername}</span>
            <button
              className={styles.socialChipUnlink}
              onClick={onDisconnectDiscord}
              type="button"
              disabled={discordUnlinking}
              aria-label="Відʼєднати Discord"
            >
              {discordUnlinking ? '…' : '×'}
            </button>
          </span>
        ) : (
          <button className={styles.socialChip} onClick={onConnectDiscord} type="button">
            <span className={`${styles.socialChipIcon} ${styles.socialChipIconDiscord}`} aria-hidden="true">
              <DiscordIcon />
            </span>
            <span className={styles.socialChipLabel}>Discord</span>
          </button>
        )}
      </div>
    </div>
  );
}
