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

// Emirates and areas. Area is mandatory when posting. Names: ru / en.
const a = (key, ru, en) => ({ key, ru, en });
const OTHER = a('other', 'Другой район', 'Other area');

export const LOCATIONS = [
  {
    key: 'dubai', ru: 'Дубай', en: 'Dubai',
    areas: [
      a('marina', 'Марина', 'Dubai Marina'), a('jlt', 'JLT', 'JLT'), a('jbr', 'JBR', 'JBR'),
      a('palm', 'Палм Джумейра', 'Palm Jumeirah'), a('downtown', 'Даунтаун', 'Downtown'),
      a('business_bay', 'Бизнес-Бэй', 'Business Bay'), a('difc', 'DIFC', 'DIFC'),
      a('jumeirah', 'Джумейра', 'Jumeirah'), a('al_barsha', 'Аль-Барша', 'Al Barsha'),
      a('dubai_hills', 'Дубай Хиллс', 'Dubai Hills'), a('arabian_ranches', 'Арабиан Ранчес', 'Arabian Ranches'),
      a('jvc', 'JVC', 'JVC'), a('jvt', 'JVT', 'JVT'), a('sports_city', 'Спортс Сити', 'Sports City'),
      a('motor_city', 'Мотор Сити', 'Motor City'), a('silicon_oasis', 'Силикон Оазис', 'Silicon Oasis'),
      a('discovery_gardens', 'Дискавери Гарденс', 'Discovery Gardens'), a('international_city', 'Интернешнл Сити', 'International City'),
      a('deira', 'Дейра', 'Deira'), a('bur_dubai', 'Бур-Дубай', 'Bur Dubai'), a('karama', 'Карама', 'Karama'),
      a('al_quoz', 'Аль-Кос', 'Al Quoz'), a('mirdif', 'Мирдиф', 'Mirdif'), a('al_nahda', 'Аль-Нахда', 'Al Nahda'),
      a('dubai_south', 'Дубай Саут', 'Dubai South'), a('jebel_ali', 'Джебель-Али', 'Jebel Ali'), OTHER,
    ],
  },
  {
    key: 'sharjah', ru: 'Шарджа', en: 'Sharjah',
    areas: [a('al_nahda', 'Аль-Нахда', 'Al Nahda'), a('al_majaz', 'Аль-Маджаз', 'Al Majaz'), a('al_khan', 'Аль-Хан', 'Al Khan'), a('al_taawun', 'Аль-Таавун', 'Al Taawun'), a('muwaileh', 'Муваиле', 'Muwaileh'), a('rolla', 'Ролла', 'Rolla'), OTHER],
  },
  {
    key: 'abu_dhabi', ru: 'Абу-Даби', en: 'Abu Dhabi',
    areas: [a('city', 'Центр', 'City center'), a('yas', 'Яс', 'Yas Island'), a('saadiyat', 'Саадият', 'Saadiyat'), a('reem', 'Аль-Рим', 'Al Reem'), a('khalifa_city', 'Халифа-Сити', 'Khalifa City'), a('mussafah', 'Муссафа', 'Mussafah'), a('al_ain', 'Аль-Айн', 'Al Ain'), OTHER],
  },
  { key: 'ajman', ru: 'Аджман', en: 'Ajman', areas: [a('city', 'Аджман', 'Ajman City'), a('nuaimiya', 'Аль-Нуаймия', 'Al Nuaimiya'), a('rawda', 'Аль-Равда', 'Al Rawda'), OTHER] },
  { key: 'rak', ru: 'Рас-эль-Хайма', en: 'Ras Al Khaimah', areas: [a('city', 'Рас-эль-Хайма', 'RAK City'), a('al_hamra', 'Аль-Хамра', 'Al Hamra'), a('marjan', 'Аль-Марджан', 'Al Marjan Island'), OTHER] },
  { key: 'fujairah', ru: 'Фуджейра', en: 'Fujairah', areas: [a('city', 'Фуджейра', 'Fujairah City'), a('dibba', 'Дибба', 'Dibba'), OTHER] },
  { key: 'uaq', ru: 'Умм-эль-Кайвайн', en: 'Umm Al Quwain', areas: [a('city', 'Умм-эль-Кайвайн', 'UAQ City'), OTHER] },
];

export const LOCATION_MAP = Object.fromEntries(LOCATIONS.map((e) => [e.key, e]));
export const validLocation = (emirate, area) => !!LOCATION_MAP[emirate]?.areas.some((x) => x.key === area);
