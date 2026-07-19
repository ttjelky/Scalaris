export const DISCORD_REDIRECT_PATH = '/oauth/discord/callback';

/** Full redirect_uri sent to Discord authorize and echoed back to the backend. */
export function getDiscordRedirectUri() {
  return `${window.location.origin}${DISCORD_REDIRECT_PATH}`;
}

let claimedCallbackCode = null;

/** Returns true the first time a given Discord code is handled this page load. */
export function claimDiscordCallback(code) {
  if (!code || claimedCallbackCode === code) {
    return false;
  }
  claimedCallbackCode = code;
  return true;
}

export class MissingDiscordClientIdError extends Error {
  constructor() {
    super('missing_discord_client_id');
    this.name = 'MissingDiscordClientIdError';
  }
}

/**
 * Редіректить браузер на Discord authorize-сторінку.
 *
 * @param {object} [opts]
 * @param {string} [opts.scope] - 'identify' достатньо для прив'язки
 *   (акаунт уже має email на нашому боці). Для входу/реєстрації потрібен
 *   ще й 'email' — бекенд використовує email з профілю Discord, щоб не
 *   створити задвоєний акаунт для людини, яка вже реєструвалась паролем.
 */
export function redirectToDiscordAuthorize({ scope = 'identify email' } = {}) {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new MissingDiscordClientIdError();
  }

  const redirectUri = getDiscordRedirectUri();
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  window.location.href = url.toString();
}
