import { describe, it, expect } from 'vitest'
import { translateMessage, remapKey, parseApiError } from './apiErrors'

describe('translateMessage', () => {
  it('translates "no active account" error', () => {
    const result = translateMessage('No active account found')
    expect(result).toBe('Неправильний email/юзернейм або пароль.')
  })

  it('translates "already exists" error', () => {
    const result = translateMessage('User with this email already exists')
    expect(result).toBe('Такий email вже зареєстровано.')
  })

  it('translates "too short" password error', () => {
    const result = translateMessage('This password is too short')
    expect(result).toBe('Пароль закороткий — потрібно щонайменше 8 символів.')
  })

  it('translates "too common" password error', () => {
    const result = translateMessage('This password is too common')
    expect(result).toBe('Цей пароль занадто простий і легко підбирається. Обери інший.')
  })

  it('translates "entirely numeric" password error', () => {
    const result = translateMessage('This password is entirely numeric')
    expect(result).toBe('Пароль не може складатися лише з цифр.')
  })

  it('translates "don\'t match" error', () => {
    const result = translateMessage("The two password fields don't match")
    expect(result).toBe('Паролі не збігаються.')
  })

  it('translates "this field is required"', () => {
    const result = translateMessage('This field is required.')
    expect(result).toBe('Це поле обов\u2019язкове.')
  })

  it('translates "enter a valid email"', () => {
    const result = translateMessage('Enter a valid email address')
    expect(result).toBe('Введи коректну email-адресу.')
  })

  it('returns null for unrecognized messages', () => {
    const result = translateMessage('Some random error')
    expect(result).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(translateMessage(null)).toBeNull()
    expect(translateMessage(123)).toBeNull()
  })
})

describe('remapKey', () => {
  it('remaps password_confirm to passwordConfirm', () => {
    expect(remapKey('password_confirm')).toBe('passwordConfirm')
  })

  it('returns other keys unchanged', () => {
    expect(remapKey('username')).toBe('username')
    expect(remapKey('email')).toBe('email')
  })
})

describe('parseApiError', () => {
  it('returns network error for no response', () => {
    const err = { request: {}, response: undefined }
    const result = parseApiError(err)
    expect(result.generalError).toContain('сервером')
    expect(result.fieldErrors).toEqual({})
  })

  it('returns throttle message for 429', () => {
    const err = { response: { status: 429, data: {} } }
    const result = parseApiError(err)
    expect(result.generalError).toContain('Забагато спроб')
  })

  it('returns server error for 500', () => {
    const err = { response: { status: 500, data: {} } }
    const result = parseApiError(err)
    expect(result.generalError).toContain('Сервер тимчасово недоступний')
  })

  it('parses field errors from DRF response', () => {
    const err = {
      response: {
        status: 400,
        data: { username: ['This field is required.'] },
      },
    }
    const result = parseApiError(err)
    expect(result.fieldErrors.username).toBeDefined()
  })

  it('parses non_field_errors as generalError', () => {
    const err = {
      response: {
        status: 400,
        data: { non_field_errors: ['Invalid credentials'] },
      },
    }
    const result = parseApiError(err)
    expect(result.generalError).toBeDefined()
  })

  it('parses detail as generalError', () => {
    const err = {
      response: {
        status: 400,
        data: { detail: 'Not found' },
      },
    }
    const result = parseApiError(err)
    expect(result.generalError).toBeDefined()
  })

  it('uses fallback when response data is not an object', () => {
    const err = {
      response: {
        status: 400,
        data: 'some string',
      },
    }
    const result = parseApiError(err)
    expect(result.generalError).toBeDefined()
  })

  it('remaps password_confirm field key', () => {
    const err = {
      response: {
        status: 400,
        data: { password_confirm: ["Don't match"] },
      },
    }
    const result = parseApiError(err)
    expect(result.fieldErrors.passwordConfirm).toBeDefined()
  })

  it('uses custom fallback option for non-object response data', () => {
    const err = {
      response: {
        status: 400,
        data: ['some error string'],
      },
    }
    const result = parseApiError(err, { fallback: 'Custom error' })
    expect(result.generalError).toBe('Custom error')
  })
})
