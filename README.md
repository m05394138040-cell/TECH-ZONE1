# TECH ZONE — موقع عرض المنتجات

موقع **بسيط وأنيق** لعرض المنتجات بأسعارها، بدون تعقيد — مجرد معرض صور احترافي يستقبل الزبائن ويحوّلهم على واتساب للطلب.

> **صُمم ليكون قالب جاهز** تقدر تبيع مواقع مشابهة بسهولة — غيّر الاسم والألوان والمحتوى فقط.

---

## ✨ المميزات

- 🎨 **تصميم ذهبي × أسود × أبيض** احترافي، RTL عربي، متجاوب على كل الأجهزة
- 📱 **2 قسم في السطر** على الموبايل، و4 على الديسكتوب
- 🛒 **زر "اطلب عبر واتساب"** مع حقل الكمية وحساب المجموع تلقائياً
  - الزبون يحدد الكمية → المجموع يتحدث لحظياً
  - يضغط الزر → يفتح واتساب برسالة جاهزة فيها: اسم المنتج، القسم، السعر، الكمية، المجموع
- 🔐 **لوحة تحكم إدارية** داخل الموقع نفسه (مش منفصلة)
  - إضافة/تعديل/حذف الأقسام
  - إضافة/تعديل/حذف المنتجات
  - رفع صور للمنتجات (تُخزن بأمان في قاعدة البيانات)
  - تغيير رقم الواتساب
  - تغيير اسم الموقع والشعار
  - تفعيل/تعطيل المنتجات (متوفر/غير متوفر)
- 🔒 **تسجيل دخول آمن** — `GH1899 / 266641` (مشفّر بـ bcrypt في DB)
- 💾 **تخزين دائم 100%** — كل البيانات والصور في PostgreSQL
  - ما تنحذف حتى لو Render سوى ريستارت أو ريديبلوي
- 🚫 **بدون** دفع، بدون طلبات، بدون سلة — فقط معرض

---

## 🚀 النشر على Render (خطوة بخطوة)

### الطريقة الأولى: بنقرة واحدة (Render Blueprint) — موصى بها

1. **ارفع الكود على GitHub**:
   - أنشئ repository جديد على GitHub
   - ارفع كل ملفات المشروع (ما عدا `node_modules` و `.env`)

2. **أنشئ حساب على Render** (https://render.com) — مجاني

3. **من Render Dashboard**:
   - اضغط **"New +"** → **"Blueprint"**
   - اربط الـ GitHub repo
   - Render رح يقرأ `render.yaml` وينشئ تلقائياً:
     - ✅ Web Service
     - ✅ PostgreSQL Database (مجاني)
   - اضغط **"Apply"**

4. **انتظر 3-5 دقائق** — خلاص الموقع شغّال!

5. **أرسل الرابط للزبائن** (يكون شكله: `https://tech-zone.onrender.com`)

---

### الطريقة الثانية: يدوي

1. أنشئ **PostgreSQL Database** على Render:
   - "New +" → "PostgreSQL"
   - اسمها: `tech-zone-db`
   - Plan: Free
   - احفظ الـ **Internal Database URL**

2. أنشئ **Web Service**:
   - "New +" → "Web Service"
   - اربط الـ GitHub repo
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm run init-db && npm start`
   - Plan: Free

3. **Environment Variables** (في Web Service → Environment):
   ```
   NODE_ENV=production
   DATABASE_URL=<الصق الرابط من الخطوة 1>
   JWT_SECRET=<أي نص عشوائي طويل - مثال: openssl rand -base64 32>
   ADMIN_USERNAME=GH1899
   ADMIN_PASSWORD=266641
   DEFAULT_WHATSAPP=+962790000000
   DEFAULT_SITE_NAME=TECH ZONE
   ```

4. اضغط **"Create Web Service"** — وانتظر.

---

## 🛠️ التشغيل المحلي (للتجربة)

### المتطلبات
- Node.js >= 18
- PostgreSQL >= 12 (أو Docker)

### الخطوات

```bash
# 1. ثبّت PostgreSQL (لو مش مثبّت)
# macOS:  brew install postgresql && brew services start postgresql
# Ubuntu: sudo apt install postgresql
# Windows: حمّل من postgresql.org

# 2. أنشئ قاعدة بيانات
createdb techzone
# أو عبر psql:
# psql -c "CREATE DATABASE techzone;"

# 3. انسخ المشروع وثبّت المكتبات
cd techzone
cp .env.example .env
# عدّل DATABASE_URL في .env

npm install

# 4. أنشئ الجداول والبيانات الافتراضية
npm run init-db

# 5. شغّل السيرفر
npm start

# 6. افتح المتصفح
# الموقع:    http://localhost:3000
# لوحة التحكم: http://localhost:3000/admin/login
# اسم المستخدم: GH1899
# كلمة المرور: 266641
```

---

## 🗂️ هيكل المشروع

```
techzone/
├── server.js              # نقطة البداية (Express app)
├── package.json
├── render.yaml            # Render Blueprint للنشر بنقرة واحدة
├── .env.example           # مثال للإعدادات
├── README.md              # هذا الملف
├── config/
│   ├── db.js              # اتصال PostgreSQL
│   └── settings.js        # تحميل إعدادات الموقع
├── middleware/
│   └── auth.js            # JWT + bcrypt للمصادقة
├── routes/
│   ├── public.js          # صفحات الزبائن
│   └── admin.js           # لوحة التحكم
├── scripts/
│   └── init-db.js         # إنشاء الجداول + البيانات الافتراضية
├── views/
│   ├── partials/          # header & footer للصفحات العامة
│   ├── admin/             # صفحات لوحة التحكم
│   ├── index.ejs          # الرئيسية
│   ├── category.ejs       # صفحة القسم
│   ├── product.ejs        # صفحة المنتج (مع زر واتساب)
│   ├── 404.ejs
│   └── error.ejs
└── public/
    ├── css/
    │   └── styles.css     # كل التنسيقات (ذهبي × أسود × أبيض)
    └── js/
        └── main.js        # حاسبة الكمية + رسالة واتساب
```

---

## 🗄️ مخطط قاعدة البيانات

### جدول `categories` (الأقسام)
| العمود | النوع | الوصف |
|---|---|---|
| `id` | serial PK | |
| `name` | varchar(100) | اسم القسم |
| `slug` | varchar(100) unique | المعرف في الـ URL |
| `icon` | varchar(20) | إيموجي للأيقونة |
| `sort_order` | int | ترتيب العرض |
| `created_at` | timestamp | |

### جدول `products` (المنتجات)
| العمود | النوع | الوصف |
|---|---|---|
| `id` | serial PK | |
| `category_id` | int FK → categories | القسم |
| `name` | varchar(200) | اسم المنتج |
| `description` | text | الوصف |
| `price` | decimal(10,2) | السعر بـ USD |
| `available` | boolean | متوفر/غير متوفر |
| `image_data` | bytea | الصورة (مخزنة كبيانات ثنائية) |
| `image_type` | varchar(50) | نوع الصورة (image/jpeg مثلاً) |
| `sort_order` | int | ترتيب العرض |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### جدول `settings` (إعدادات الموقع)
| العمود | النوع | الوصف |
|---|---|---|
| `key` | varchar(50) PK | مثل `whatsapp_number` |
| `value` | text | القيمة |

### جدول `admin_users` (المسؤولين)
| العمود | النوع | الوصف |
|---|---|---|
| `id` | serial PK | |
| `username` | varchar(50) unique | اسم المستخدم |
| `password_hash` | varchar(255) | كلمة المرور (مشفّرة bcrypt) |

---

## ❓ أسئلة شائعة

### س: كيف أضيف منتجات؟
افتح `/admin/login` وسجّل دخول. روح لـ "إدارة المنتجات" → "إضافة منتج جديد".

### س: كيف أغيّر رقم الواتساب؟
افتح لوحة التحكم → "الإعدادات" → "رقم الواتساب". التغيير فوري بدون ما تلمس الكود.

### س: كيف أوسّع الصور اللي تنعرض على الموقع (Thumbnail)؟
افتراضياً، صور المنتجات تُعرض كاملة. لو بدك صور مصغّرة، عدّل دالة `/img/:id` في `routes/public.js` لاستخدام مكتبة مثل `sharp`.

### س: كيف أنسخ المشروع لموقع جديد (للبيع)؟
1. انسخ كل الملفات
2. غيّر `DEFAULT_SITE_NAME` و `logo_text` في `.env` أو من الإعدادات
3. غيّر رقم الواتساب من الإعدادات
4. احذف المنتجات من قاعدة البيانات (احذف محتوى جدول products)
5. غيّر كلمات المرور في `.env` (ADMIN_USERNAME/ADMIN_PASSWORD) ثم شغّل `npm run init-db`

### س: هل لازم بطاقة ائتمان لـ Render Free؟
لا! Free tier ما يطلب بطاقة. كل الخدمات (Web Service + PostgreSQL) مجانية تماماً.

### س: ليش PostgreSQL مش SQLite؟
- Render's free tier يوقّف الـ disk عند كل ريستارت → SQLite/files تنحذف
- PostgreSQL عنده **persistent disk منفصل** → البيانات باقية دائماً
- PostgreSQL أسرع لتطبيقات الإنتاج

### س: وين الصور مخزنة؟
داخل قاعدة البيانات كـ `bytea` (بيانات ثنائية). هذا أأمن من تخزينها على القرص (اللي ينمسح عند Render restart).

### س: كيف أعمل backup؟
```bash
# من psql:
pg_dump $DATABASE_URL > backup.sql

# لاستعادة:
psql $DATABASE_URL < backup.sql
```

---

## 🎨 التخصيص

### تغيير الألوان
افتح `public/css/styles.css` وعدّل المتغيرات في الأعلى:
```css
:root {
  --gold: #d4af37;          /* اللون الذهبي الرئيسي */
  --gold-light: #f4d03f;    /* ذهبي فاتح (للتدرجات) */
  --gold-dark: #b8860b;     /* ذهبي غامق */
  --black: #0a0a0a;         /* الخلفية الرئيسية */
  --wa-green: #25d366;      /* لون زر الواتساب */
}
```

### تغيير الأقسام الافتراضية
افتح `scripts/init-db.js` وعدّل `DEFAULT_CATEGORIES`، ثم احذف الأقسام القديمة من DB:
```sql
DELETE FROM categories;
```
ثم شغّل `npm run init-db` مرة ثانية.

### تغيير رسالة الواتساب الافتراضية
افتح `public/js/main.js` وعدّل المصفوفة `lines` في دالة `updateTotal()`.

---

## 📜 الرخصة

ملكية خاصة — تقدر تنشره لمواقعك الشخصية أو تبيعه كقالب.

---

**صُنع بـ ❤️ لزبائن TECH ZONE**
