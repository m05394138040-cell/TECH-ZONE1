# 🚀 دليل سريع - TECH ZONE

## ⚡ النشر على Render (5 دقائق)

### الخطوة 1: ارفع على GitHub
```bash
cd techzone
git init
git add .
git commit -m "Initial commit"
# أنشئ repo جديد على GitHub، ثم:
git remote add origin https://github.com/YOUR_USERNAME/techzone.git
git branch -M main
git push -u origin main
```

### الخطوة 2: أنشئ على Render
1. روح https://render.com وسجّل حساب (مجاني)
2. اضغط **"New +"** → **"Blueprint"**
3. اربط الـ GitHub repo
4. اضغط **"Apply"** — خلاص!

> Render رح يقرأ `render.yaml` وينشئ تلقائياً:
> - ✅ Web Service (لتشغيل الموقع)
> - ✅ PostgreSQL Database (لتخزين البيانات)
> - ✅ ينشئ جداول + 17 قسم افتراضي + حساب الأدمن

### الخطوة 3: استنى 3-5 دقائق
- رح يعطيك رابط: `https://tech-zone-xxxx.onrender.com`
- هذا الرابط ابعثه لزبائنك

### الخطوة 4: سجّل دخول للوحة التحكم
- روح: `https://tech-zone-xxxx.onrender.com/admin/login`
- اسم المستخدم: `GH1899`
- كلمة المرور: `266641`
- غيّر رقم الواتساب من "الإعدادات"

---

## 🛠️ التشغيل المحلي (اختياري - للتجربة على جهازك)

```bash
# 1. ثبّت PostgreSQL
# macOS:   brew install postgresql && brew services start postgresql
# Ubuntu:  sudo apt install postgresql
# Windows: حمّل من postgresql.org

# 2. أنشئ قاعدة بيانات
createdb techzone

# 3. ثبّت المشروع
cd techzone
cp .env.example .env
# عدّل DATABASE_URL في .env لو لازم
npm install

# 4. أنشئ الجداول والبيانات
npm run init-db

# 5. شغّل
npm start

# افتح: http://localhost:3000
```

---

## 📱 كيف تستخدمه

### للزبون:
1. يفتح الرابط
2. يتصفح الأقسام
3. يدخل على المنتج اللي عجبه
4. يحدد الكمية
5. يضغط "اطلب عبر واتساب"
6. يفتح واتساب برسالة جاهزة — يضغط إرسال — يطلب منك

### لك (المالك):
1. روح `/admin/login`
2. سجّل دخول
3. من "إدارة المنتجات" → "إضافة منتج جديد":
   - اسم المنتج
   - القسم
   - السعر
   - الوصف
   - الصورة
   - متوفر/غير متوفر
4. احفظ — خلاص!

---

## 💾 هل البيانات آمنة 100%؟

**نعم.** كل البيانات (المنتجات، الأقسام، الإعدادات) والصور مخزنة في **PostgreSQL** — قاعدة بيانات منفصلة تماماً عن السيرفر. حتى لو:
- Render سوى ريستارت
- Render سوى ريديبلوي
- السيرفر فجأة انفجر
- مرّ 15 دقيقة أو 15 يوم

… البيانات **ما تنحذف أبداً** ✅

(سابقاً كنت تستخدم SQLite/JSON على القرص — هذا ينمسح. PostgreSQL هو الحل الصحيح.)

---

## 🆘 مشاكل شائعة

### "ما أقدر أدخل للوحة التحكم"
- تأكد من اسم المستخدم `GH1899` وكلمة المرور `266641` (حساسة لحالة الأحرف)
- امسح الـ cookies وجرب مرة ثانية

### "ما تظهر صور المنتجات"
- الصور تُعرض من DB مباشرة — لو الموقع بطيء شوي، انتظر
- تأكد من رفع صور بصيغة JPG/PNG/GIF/WEBP وأقل من 5MB

### "تغيّر شيء بعد deploy"
- هذا طبيعي في أول deploy على Render free tier
- لو صار بشكل متكرر، تواصل معي

### "كيف أنسخ المشروع لمتجر ثاني؟"
1. انسخ كل ملفات المشروع إلى مجلد جديد
2. في `.env` غيّر: `DEFAULT_SITE_NAME` و `DEFAULT_WHATSAPP`
3. شغّل `npm run init-db` (رح ينشئ الأقسام الافتراضية + الأدمن)
4. غيّر محتوى المنتجات من اللوحة

---

**بالتوفيق! 🚀**
