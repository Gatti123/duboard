// Terms of Use and Privacy Policy texts (RU/EN).
// IMPORTANT: this is a working draft, have a UAE lawyer review it before public launch.
// Set OPERATOR to the legal name of the licensed entity that runs Duboard.
export const OPERATOR = 'Duboard';
export const UPDATED = '20.11.2026';

export const LEGAL = {
  terms: {
    ru: {
      title: 'Условия использования',
      sections: [
        ['Что такое Duboard', 'Duboard — доска объявлений в Telegram для жителей ОАЭ. Мы даём площадку для публикации объявлений. Мы не продаём товары и услуги, не принимаем оплату и не являемся стороной сделок между пользователями. Оператор сервиса: {operator}.'],
        ['Кто может пользоваться', 'Сервис предназначен для лиц от 18 лет. Для публикации нужен @username в Telegram: по нему с вами связываются покупатели.'],
        ['Что нельзя публиковать', 'Недвижимость (продажа, аренда, комнаты). Продажа животных. Лекарства, стероиды и подконтрольные вещества. Оружие, боеприпасы и их копии. Подделки и реплики брендов. Предложения кредитов и рассрочки в автообъявлениях. Ссылки на сайты и внешние каналы. Спам, обман, чужие фото и данные. Любые товары и услуги, запрещённые законами ОАЭ. Контент, оскорбляющий людей или религию, и любой контент, нарушающий закон.'],
        ['Модерация и удаление', 'Все объявления проверяются до публикации. Мы можем отклонить или снять объявление, ограничить или заблокировать аккаунт при нарушении правил, в том числе без предупреждения. Пожаловаться на объявление можно кнопкой в его карточке. Если на объявление пожаловались несколько пользователей, оно временно снимается и проверяется заново.'],
        ['Ваша ответственность', 'Вы отвечаете за содержание и достоверность своего объявления и за право продавать указанный товар или услугу. Фото должны быть вашими или вы должны иметь право их использовать. Публикуя объявление, вы разрешаете Duboard показывать его в приложении.'],
        ['Безопасность сделок', 'Мы не проверяем продавцов, покупателей и товары и не гарантируем сделки. Встречайтесь в людных местах, проверяйте товар на месте и не переводите предоплату незнакомым людям.'],
        ['Ограничение ответственности', 'Сервис предоставляется «как есть». В пределах, допустимых законом, мы не отвечаем за убытки от сделок между пользователями и за перебои в работе сервиса.'],
        ['Изменения и применимое право', 'Мы можем обновлять эти условия; продолжая пользоваться сервисом, вы соглашаетесь с новой редакцией. К отношениям применяется право ОАЭ. Связаться с нами: {bot}.'],
      ],
    },
    en: {
      title: 'Terms of Use',
      sections: [
        ['What Duboard is', 'Duboard is a classifieds board in Telegram for people in the UAE. We provide a place to publish listings. We do not sell goods or services, do not process payments and are not a party to deals between users. Operator: {operator}.'],
        ['Who can use it', 'The service is for people aged 18 and over. To post, you need a Telegram @username: buyers contact you through it.'],
        ['What you must not post', 'Real estate (sale, rent, rooms). Sale of animals. Medicines, steroids and controlled substances. Weapons, ammunition and replicas. Counterfeit or replica branded goods. Offers of loans or financing in car listings. Links to websites or external channels. Spam, fraud, other people\'s photos or data. Anything prohibited by UAE law. Content that insults people or religion, or is otherwise unlawful.'],
        ['Moderation and removal', 'Every listing is reviewed before it is published. We may reject or remove a listing and restrict or ban an account for breaking the rules, including without notice. You can report a listing with the button on its page. If several users report a listing, it is temporarily taken down and reviewed again.'],
        ['Your responsibility', 'You are responsible for the content and accuracy of your listing and for having the right to sell the item or service. Photos must be yours, or you must have the right to use them. By posting, you allow Duboard to display your listing in the app.'],
        ['Safe deals', 'We do not verify sellers, buyers or items and do not guarantee any deal. Meet in public places, inspect the item on the spot and do not prepay strangers.'],
        ['Limitation of liability', 'The service is provided "as is". To the extent permitted by law, we are not liable for losses from deals between users or for service interruptions.'],
        ['Changes and governing law', 'We may update these terms; by continuing to use the service you accept the new version. UAE law applies. Contact us: {bot}.'],
      ],
    },
  },
  privacy: {
    ru: {
      title: 'Политика конфиденциальности',
      sections: [
        ['Какие данные мы собираем', 'Telegram ID, имя, @username и язык интерфейса. Содержимое объявлений: текст, цена, категория, фото. Избранное и жалобы. Технические данные, например число просмотров объявления.'],
        ['Зачем мы их используем', 'Чтобы работал сервис: показывать объявления, связывать покупателей с продавцами, проверять объявления, защищаться от спама и присылать уведомления в боте.'],
        ['Основание обработки', 'Ваше согласие, которое вы даёте при первом входе. Вы можете отозвать его, удалив аккаунт.'],
        ['Что видят другие пользователи', 'Публично показываются объявление, его фото и ваш @username (по нему покупатель пишет вам). Мы не продаём ваши данные и не используем их для рекламы третьих лиц.'],
        ['Кто обрабатывает данные', 'Хостинг и база данных работают у провайдеров (Railway, Supabase), сообщения передаются через Telegram. Серверы провайдеров могут находиться за пределами ОАЭ.'],
        ['Сколько мы храним данные', 'Пока у вас есть аккаунт. После удаления аккаунта объявления, фото, избранное и ваши жалобы удаляются. Копии у провайдера могут храниться ограниченное время.'],
        ['Ваши права', 'Вы можете получить информацию о своих данных, исправить их и удалить. Удаление: кнопка «Удалить аккаунт и данные» в разделе «Мои». По остальным вопросам пишите: {bot}.'],
        ['Безопасность и дети', 'Мы применяем разумные технические меры защиты, но абсолютной гарантии дать нельзя. Сервис предназначен для лиц от 18 лет.'],
        ['Изменения', 'Мы можем обновлять политику; актуальная версия всегда доступна в приложении. Оператор: {operator}.'],
      ],
    },
    en: {
      title: 'Privacy Policy',
      sections: [
        ['Data we collect', 'Telegram ID, name, @username and interface language. Listing content: text, price, category, photos. Saved listings and reports. Technical data such as a listing\'s view count.'],
        ['Why we use it', 'To run the service: show listings, connect buyers with sellers, review listings, protect against spam and send notifications in the bot.'],
        ['Legal basis', 'Your consent, given when you first open the app. You can withdraw it by deleting your account.'],
        ['What other users see', 'Your listing, its photos and your @username are public (buyers use it to message you). We do not sell your data or use it for third-party advertising.'],
        ['Who processes the data', 'Hosting and the database run with providers (Railway, Supabase); messages go through Telegram. Provider servers may be located outside the UAE.'],
        ['How long we keep it', 'As long as you have an account. When you delete it, your listings, photos, saved items and reports are deleted. Provider backups may be kept for a limited time.'],
        ['Your rights', 'You can get information about your data, correct it and delete it. To delete: use "Delete account and data" in the "My ads" section. For anything else write to: {bot}.'],
        ['Security and children', 'We apply reasonable technical safeguards, but no system is perfectly secure. The service is for people aged 18 and over.'],
        ['Changes', 'We may update this policy; the current version is always available in the app. Operator: {operator}.'],
      ],
    },
  },
};

export function fillLegal(text, botUsername) {
  return text.replaceAll('{operator}', OPERATOR).replaceAll('{bot}', botUsername ? `@${botUsername}` : 'Telegram');
}
