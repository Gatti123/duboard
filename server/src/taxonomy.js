// Single source of truth for categories, subcategories and extra fields.
// Sent to the Mini App via /api/me, so the form and the filters render from this.
const s = (key, ru, en) => ({ key, ru, en });

const CAR_BRANDS = ['Toyota', 'Nissan', 'Mitsubishi', 'Honda', 'Mazda', 'Lexus', 'Infiniti', 'Hyundai', 'Kia', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Land Rover', 'Porsche', 'Ford', 'Chevrolet', 'GMC', 'Jeep', 'Tesla', 'Other'];
const ELECTRONICS_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Google', 'OnePlus', 'Sony', 'LG', 'Dell', 'HP', 'Lenovo', 'Asus', 'Other'];

export const TAXONOMY = [
  {
    key: 'electronics', icon: '📱', ru: 'Электроника', en: 'Electronics', condition: true, brands: ELECTRONICS_BRANDS,
    subs: [s('phones', 'Телефоны', 'Phones'), s('laptops', 'Ноутбуки и ПК', 'Laptops & PCs'), s('tv_audio', 'ТВ и аудио', 'TV & audio'), s('appliances', 'Бытовая техника', 'Home appliances'), s('gaming', 'Игры и консоли', 'Gaming'), s('other', 'Другое', 'Other')],
  },
  {
    key: 'cars', icon: '🚗', ru: 'Авто и мото', en: 'Cars & bikes', condition: true, brands: CAR_BRANDS, year: true, mileage: true,
    subs: [s('cars', 'Легковые', 'Cars'), s('suv', 'Внедорожники', 'SUVs'), s('motorcycles', 'Мото', 'Motorcycles'), s('parts', 'Запчасти и аксессуары', 'Parts & accessories')],
  },
  {
    key: 'furniture', icon: '🛋️', ru: 'Мебель', en: 'Furniture', condition: true,
    subs: [s('sofas', 'Диваны и кресла', 'Sofas & chairs'), s('beds', 'Кровати и матрасы', 'Beds & mattresses'), s('tables', 'Столы и стулья', 'Tables & chairs'), s('storage', 'Шкафы и комоды', 'Wardrobes & storage'), s('other', 'Другое', 'Other')],
  },
  {
    key: 'home', icon: '🏠', ru: 'Для дома', en: 'Home', condition: true,
    subs: [s('kitchen', 'Кухня', 'Kitchen'), s('decor', 'Декор', 'Decor'), s('tools', 'Инструменты', 'Tools'), s('other', 'Другое', 'Other')],
  },
  {
    key: 'clothes', icon: '👕', ru: 'Одежда', en: 'Clothes', condition: true,
    subs: [s('women', 'Женская', 'Women'), s('men', 'Мужская', 'Men'), s('shoes', 'Обувь', 'Shoes'), s('bags', 'Сумки и аксессуары', 'Bags & accessories')],
  },
  {
    key: 'kids', icon: '🧸', ru: 'Детям', en: 'Kids', condition: true,
    subs: [s('clothes', 'Одежда', 'Clothes'), s('toys', 'Игрушки', 'Toys'), s('gear', 'Коляски и автокресла', 'Strollers & car seats'), s('other', 'Другое', 'Other')],
  },
  {
    key: 'services', icon: '🛠️', ru: 'Услуги', en: 'Services',
    subs: [s('repair', 'Ремонт', 'Repair'), s('cleaning', 'Уборка', 'Cleaning'), s('beauty', 'Красота', 'Beauty'), s('moving', 'Переезд и доставка', 'Moving & delivery'), s('tutoring', 'Обучение', 'Tutoring'), s('photo', 'Фото и видео', 'Photo & video'), s('other', 'Другое', 'Other')],
  },
  {
    key: 'jobs', icon: '💼', ru: 'Работа', en: 'Jobs',
    subs: [s('full_time', 'Полная занятость', 'Full-time'), s('part_time', 'Подработка', 'Part-time'), s('freelance', 'Фриланс', 'Freelance')],
  },
  { key: 'free', icon: '🎁', ru: 'Отдам даром', en: 'Free stuff', subs: [] },
  { key: 'other', icon: '📦', ru: 'Прочее', en: 'Other', subs: [] },
];

export const CATEGORY_MAP = Object.fromEntries(TAXONOMY.map((c) => [c.key, c]));
