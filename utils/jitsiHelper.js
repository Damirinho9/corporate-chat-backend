// utils/jitsiHelper.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Logger = require('./logger');
const logger = new Logger('jitsi-helper');

/**
 * Генерирует уникальное имя комнаты для Jitsi
 * @param {string} prefix - Префикс для комнаты
 * @returns {string} Уникальное имя комнаты
 */
function generateRoomName(prefix = 'room') {
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${timestamp}-${randomStr}`;
}

/**
 * Генерирует JWT токен для Jitsi Meet
 * @param {object} options - Параметры токена
 * @param {string} options.roomName - Имя комнаты
 * @param {object} options.user - Информация о пользователе
 * @param {number} options.user.id - ID пользователя
 * @param {string} options.user.name - Имя пользователя
 * @param {string} options.user.email - Email пользователя (опционально)
 * @param {boolean} options.isModerator - Является ли пользователь модератором
 * @returns {string} JWT токен
 */
function generateJitsiToken(options) {
  const {
    roomName,
    user,
    isModerator = false
  } = options;

  // JITSI_APP_ID и JITSI_APP_SECRET должны быть в .env
  const appId = process.env.JITSI_APP_ID || 'corporate_chat';
  const appSecret = process.env.JITSI_APP_SECRET;

  if (!appSecret) {
    logger.warn('JITSI_APP_SECRET not configured. Using default (INSECURE for production!)');
  }

  const secret = appSecret || 'your_jitsi_secret_change_in_production';

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (24 * 60 * 60); // Токен действителен 24 часа

  const payload = {
    // Стандартные JWT claims
    iss: appId,
    sub: process.env.JITSI_DOMAIN || 'meet.jitsi',
    aud: appId,
    iat: now,
    exp: exp,
    nbf: now,

    // Jitsi-специфичные claims
    context: {
      user: {
        id: user.id.toString(),
        name: user.name,
        email: user.email || `user${user.id}@corporate-chat.local`,
        avatar: user.avatar || undefined,
        moderator: isModerator ? 'true' : 'false'
      },
      features: {
        livestreaming: isModerator ? 'true' : 'false',
        recording: isModerator ? 'true' : 'false',
        transcription: 'false',
        'outbound-call': 'false'
      }
    },

    // Имя комнаты
    room: roomName,

    // Модератор имеет больше прав
    moderator: isModerator
  };

  try {
    const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
    return token;
  } catch (error) {
    logger.error('Error generating Jitsi token:', error);
    throw error;
  }
}

/**
 * Генерирует URL для Jitsi встречи
 * @param {string} roomName - Имя комнаты
 * @param {string} token - JWT токен (опционально)
 * @param {string} callType - Тип звонка ('audio' | 'video')
 * @returns {string} URL встречи
 */
function generateJitsiUrl(roomName, token = null, callType = 'video') {
  const jitsiDomain = process.env.JITSI_DOMAIN || 'meet.jit.si';
  const useJWT = process.env.JITSI_USE_JWT === 'true';

  let url = `https://${jitsiDomain}/${roomName}`;

  // Если используем JWT аутентификацию, добавляем токен
  if (useJWT && token) {
    url += `?jwt=${token}`;
  }

  // Дополнительные параметры для улучшения качества
  const params = new URLSearchParams({
    // Настройки качества
    'config.resolution': '720',
    'config.constraints.video.height': JSON.stringify({ ideal: 720, max: 1080 }),
    'config.disableSimulcast': 'false',
    'config.enableLayerSuspension': 'true',

    // UI настройки
    'config.prejoinPageEnabled': 'false', // Пропускаем страницу входа
    'config.disableDeepLinking': 'true',

    // Функции
    'config.enableWelcomePage': 'false',
    'config.enableClosePage': 'false',
    'config.enableNoisyMicDetection': 'true',

    // Звук
    'config.disableAudioLevels': 'false',
    'config.stereo': 'true',
    'config.opusMaxAverageBitrate': '128000'
  });

  // Для аудиозвонков добавляем параметр для отключения видео
  if (callType === 'audio') {
    params.set('config.startWithVideoMuted', 'true');
  }

  if (!useJWT) {
    url += '?' + params.toString();
  }

  return url;
}

/**
 * Генерирует конфигурацию для встраивания Jitsi
 * @param {object} options - Параметры конфигурации
 * @returns {object} Конфигурация для Jitsi Meet External API
 */
function generateJitsiConfig(options = {}) {
  const {
    roomName,
    userInfo = {},
    isModerator = false,
    callType = 'video',
    configOverrides = {},
    interfaceConfigOverrides = {}
  } = options;

  const config = {
    // Основные настройки
    hosts: {
      domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
      muc: `conference.${process.env.JITSI_DOMAIN || 'meet.jit.si'}`
    },

    // Качество видео
    resolution: 720,
    constraints: {
      video: {
        height: { ideal: 720, max: 1080, min: 360 },
        width: { ideal: 1280, max: 1920, min: 640 }
      }
    },

    // Отключаем simulcast для стабильности
    disableSimulcast: false,

    // Включаем адаптацию качества
    enableLayerSuspension: true,

    // Аудио настройки
    stereo: true,
    opusMaxAverageBitrate: 128000,

    // Функциональность
    startWithAudioMuted: false,
    startWithVideoMuted: callType === 'audio', // Для аудиозвонков отключаем видео
    enableWelcomePage: false,
    enableClosePage: false,
    prejoinPageEnabled: false,

    // Запись (только для модераторов)
    fileRecordingsEnabled: isModerator,
    liveStreamingEnabled: isModerator,

    // Чат
    disableInviteFunctions: false,

    // Расшаривание экрана
    desktopSharingChromeExtId: null,
    desktopSharingFirefoxExtId: null,

    // Мобильная оптимизация
    disableAudioLevels: false,
    enableNoAudioDetection: true,
    enableNoisyMicDetection: true,

    ...configOverrides
  };

  const interfaceConfig = {
    TOOLBAR_BUTTONS: [
      'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
      'fodeviceselection', 'hangup', 'chat', 'recording',
      'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
      'videoquality', 'filmstrip', 'feedback', 'stats', 'shortcuts',
      'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone'
    ],

    // Убираем брендинг Jitsi (если используем свой сервер)
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
    SHOW_BRAND_WATERMARK: false,

    // Настройки интерфейса
    DEFAULT_BACKGROUND: '#474747',
    DEFAULT_LOCAL_DISPLAY_NAME: 'Я',
    DEFAULT_REMOTE_DISPLAY_NAME: 'Участник',
    DISABLE_VIDEO_BACKGROUND: false,
    INITIAL_TOOLBAR_TIMEOUT: 20000,
    TOOLBAR_TIMEOUT: 4000,

    // Мобильная версия
    MOBILE_APP_PROMO: false,

    ...interfaceConfigOverrides
  };

  return {
    roomName,
    userInfo: {
      displayName: userInfo.name || 'Anonymous',
      email: userInfo.email || '',
      ...userInfo
    },
    configOverwrite: config,
    interfaceConfigOverwrite: interfaceConfig
  };
}

/**
 * Валидирует настройки Jitsi
 * @returns {object} Результат валидации
 */
function validateJitsiConfig() {
  const warnings = [];
  const errors = [];

  if (!process.env.JITSI_DOMAIN) {
    warnings.push('JITSI_DOMAIN not configured, using default meet.jit.si');
  }

  if (!process.env.JITSI_APP_SECRET) {
    warnings.push('JITSI_APP_SECRET not configured, JWT tokens will be insecure');
  }

  if (!process.env.JITSI_APP_ID) {
    warnings.push('JITSI_APP_ID not configured, using default');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

module.exports = {
  generateRoomName,
  generateJitsiToken,
  generateJitsiUrl,
  generateJitsiConfig,
  validateJitsiConfig
};
