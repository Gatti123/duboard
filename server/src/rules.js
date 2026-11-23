// Content rules for anti-spam. Edit the lists freely.
// Returns null if the text is fine, otherwise a reason code the Mini App translates.

const LINKS = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|\b[a-z0-9-]{2,}\.(com|ae|ru|net|org|io|me|app|xyz|top|club)\b)/i;

// Real estate is not allowed on Duboard.
const REAL_ESTATE = /(сдам[а-я]* в аренду|сдаю в аренду|сда[её]тся|аренд[аы] (квартир|комнат|вилл|студи|жиль)|(квартир|комнат|вилл|студи)[а-я]* в аренду|продам (квартиру|дом|виллу)|продаётся (квартира|вилла)|апартамент|bed ?space|partition room|room for rent|rooms? to let|for rent|apartment for|flat for|villa for|studio for|townhouse for|real estate|недвижимост)/i;

const SPAM = /(казино|casino|ставки на спорт|betting|binary options|бинарные опционы|быстрый заработок|заработок без вложений|easy money|forex signals|форекс сигналы|escort|эскорт|интим|\b18\+|\bxxx\b|viagra|виагра|\bcvv\b|carding|поддельн[а-я]* (документ|паспорт|прав)|fake (passport|id|documents)|visa for sale|продам визу|crypto airdrop|pump group)/i;

// Selling live animals needs a licence in the UAE.
const ANIMALS = /(щен(ок|ка|ки|ков)\b|щенк|котят|котен[оа]?к|puppy|puppies|kitten|породист|pedigree|dogs? for sale|cats? for sale|parrots? for sale|продам (собак|кошк|кот[а-я]*|попугая|хомяк))/i;
// Medicines, steroids, controlled drugs.
const MEDICINE = /(prescription|antibiotic|steroids?\b|anabolic|tramadol|xanax|adderall|антибиотик|рецептурн|стероид|анаболик|трамадол|ксанакс|аддералл|лекарств[а-я]* без рецепта)/i;
// Weapons and replicas.
const WEAPONS = /(firearm|pistol|revolver|rifle|shotgun|ammunition|\bammo\b|taser|stun gun|brass knuckles|огнестрельн|травматическ|револьвер|пистолет-пулем|ружь[её]|ружья|кастет|электрошокер|перцовый баллончик|нож-бабочка)/i;
// Counterfeits.
const COUNTERFEIT = /(реплика|replica|first copy|1:1 copy|master copy|aaa quality|fake (rolex|gucci|louis|nike|apple)|подделк|counterfeit|копия (люкс|apple|iphone|rolex|gucci)|люкс копия)/i;
// Financing offers: private sellers have no licence for financial services (cars category only).
const FINANCE = /(financing|installments?|bank loan|\bloan\b|0% down|кредит|рассрочк|займ|без первоначального взноса)/i;

export function checkContent(...texts) {
  const text = texts.filter(Boolean).join(' \n ');
  if (LINKS.test(text)) return 'links';
  if (REAL_ESTATE.test(text)) return 'realestate';
  if (SPAM.test(text)) return 'spam';
  if (ANIMALS.test(text)) return 'animals';
  if (MEDICINE.test(text)) return 'medicine';
  if (WEAPONS.test(text)) return 'weapons';
  if (COUNTERFEIT.test(text)) return 'counterfeit';
  return null;
}

// Rules that depend on the category.
export function checkCategoryRules(category, ...texts) {
  const text = texts.filter(Boolean).join(' \n ');
  if (category === 'cars' && FINANCE.test(text)) return 'finance';
  return null;
}

export const LIMITS = {
  perDay: 5,        // new listings per user per 24h
  pendingMax: 5,    // listings waiting for moderation at once
  reportsToHide: 3, // distinct reporters that send a live listing back to moderation
};
