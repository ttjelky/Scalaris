// Бекенд (DRF / Django / simplejwt) досі повертає частину повідомлень
// англійською (валідатори пароля, "field is required" тощо). Цей словник
// ловить повторювані патерни і підміняє їх на зрозумілий український
// текст. Все нерозпізнане падає у fallback, а не показується юзеру
// сирим англійським рядком.
const TRANSLATIONS = [
  [/no active account/i, 'Неправильний email/юзернейм або пароль.'],
  [/already exists/i, 'Такий email вже зареєстровано.'],
  [/too short/i, 'Пароль закороткий — потрібно щонайменше 8 символів.'],
  [/too common/i, 'Цей пароль занадто простий і легко підбирається. Обери інший.'],
  [/entirely numeric/i, 'Пароль не може складатися лише з цифр.'],
  [/too similar to the/i, 'Пароль занадто схожий на твій юзернейм чи email.'],
  [/invalid or expired reset token/i, 'Посилання для відновлення паролю недійсне або вже було використане. Запроси нове.'],
  [/user not found/i, 'Посилання для відновлення паролю недійсне. Запроси нове.'],
  [/don.?t match/i, 'Паролі не збігаються.'],
  [/this field may not be blank/i, 'Це поле обов’язкове.'],
  [/this field is required/i, 'Це поле обов’язкове.'],
  [/enter a valid email/i, 'Введи коректну email-адресу.'],
  [
    /^no_linked_account$/,
    'До цього Discord-акаунту не прив’язано жодного акаунту Scalaris. Увійди електронною поштою й паролем — або зареєструйся.',
  ],
  [/invalid_grant/i, 'Код авторизації Discord уже використано або прострочений. Спробуй увійти ще раз.'],
  [/invalid redirect_uri/i, 'Невідповідний redirect URI. Перевір налаштування Discord OAuth.'],
];

// Ключі полів, які бекенд називає інакше, ніж стейт у формі
// (snake_case на бекенді vs camelCase у React-компонентах).
const KEY_ALIASES = {
  password_confirm: 'passwordConfirm',
};

export function translateMessage(msg) {
  if (typeof msg !== 'string') return null;
  for (const [pattern, translated] of TRANSLATIONS) {
    if (pattern.test(msg)) return translated;
  }
  return null;
}

export function remapKey(key) {
  return KEY_ALIASES[key] || key;
}

const NETWORK_MESSAGE =
  'Не вдалося з’єднатися з сервером. Перевір інтернет-з’єднання та спробуй ще раз.';
const THROTTLE_MESSAGE = 'Забагато спроб. Зачекай трохи і спробуй ще раз.';
const SERVER_MESSAGE = 'Сервер тимчасово недоступний. Спробуй, будь ласка, трохи пізніше.';

/**
 * Розбирає axios-помилку від DRF-ендпоінта на:
 *  - fieldErrors: { [назваПоля]: 'зрозуміле повідомлення' } — показується під конкретним інпутом
 *  - generalError: string | null — показується у шапці форми (мережа, 429, 5xx, detail/non_field_errors)
 *
 * @param {object} err - помилка з axios (catch у onSubmit)
 * @param {object} [opts]
 * @param {string} [opts.fallback] - текст, якщо повідомлення бекенду не вдалось розпізнати/перекласти
 */
export function parseApiError(err, { fallback = 'Щось пішло не так. Спробуй ще раз.' } = {}) {
  if (!err.response) {
    // немає response взагалі — обірваний запит, немає інтернету, CORS тощо
    return { fieldErrors: {}, generalError: NETWORK_MESSAGE };
  }

  const { status, data } = err.response;

  if (status === 429) {
    return { fieldErrors: {}, generalError: THROTTLE_MESSAGE };
  }
  if (status >= 500) {
    return { fieldErrors: {}, generalError: SERVER_MESSAGE };
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const fieldErrors = {};
    let generalError = null;

    for (const [key, value] of Object.entries(data)) {
      const raw = Array.isArray(value) ? value[0] : value;
      if (typeof raw !== 'string') continue;

      const translated = translateMessage(raw) || fallback;

      if (key === 'detail' || key === 'non_field_errors') {
        generalError = translated;
      } else {
        fieldErrors[remapKey(key)] = translated;
      }
    }

    if (!generalError && Object.keys(fieldErrors).length === 0) {
      generalError = fallback;
    }

    return { fieldErrors, generalError };
  }

  return { fieldErrors: {}, generalError: fallback };
}