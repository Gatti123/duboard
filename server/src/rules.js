// Content rules for anti-spam. Edit the lists freely.
// Returns null if the text is fine, otherwise a reason code the Mini App translates.

const LINKS = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|\b[a-z0-9-]{2,}\.(com|ae|ru|net|org|io|me|app|xyz|top|club)\b)/i;

// Real estate is not allowed on Duboard.
const REAL_ESTATE = /(сдам[а-я]* в аренду|сдаю в аренду|сда[её]тся|аренд[аы] (квартир|комнат|вилл|студи|жиль)|(квартир|комнат|вилл|студи)[а-я]* в аренду|продам (квартиру|дом|виллу)|продаётся (квартира|вилла)|апартамент|bed ?space|partition room|room for rent|rooms? to let|for rent|apartment for|flat for|villa for|studio for|townhouse for|real estate|недвижимост)/i;

const SPAM = /(казино|casino|ставки на спорт|betting|binary options|бинарные опционы|быстрый заработок|заработок без вложений|easy money|forex signals|форекс сигналы|escort|эскорт|интим|\b18\+|\bxxx\b|viagra|виагра|\bcvv\b|carding|поддельн[а-я]* (документ|паспорт|прав)|fake (passport|id|documents)|visa for sale|продам визу|crypto airdrop|pump group)/i;

export function checkContent(...texts) {
  const text = texts.filter(Boolean).join(' \n ');
  if (LINKS.test(text)) return 'links';
  if (REAL_ESTATE.test(text)) return 'realestate';
  if (SPAM.test(text)) return 'spam';
  return null;
}

export const LIMITS = {
  perDay: 5,        // new listings per user per 24h
  pendingMax: 5,    // listings waiting for moderation at once
  reportsToHide: 3, // distinct reporters that send a live listing back to moderation
};
