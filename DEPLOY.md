# راهنمای Deploy از صفر روی GitHub Pages

این راهنما از صفر تا صد هر کاری که لازمه رو توضیح می‌ده. هیچ مرحله‌ای پیش‌فرض نیست.

---

## پیش‌نیازها

- Node.js نسخه 18.17+ یا 20+ نصب باشه: `node -v`
- Git نصب باشه: `git --version`
- یه اکانت GitHub داشته باشی.
- این پوشه (`portfolio2`) روی سیستمت باشه.

---

## مرحله 1 — تست لوکال (اختیاری ولی توصیه می‌شه)

توی ترمینال، وارد پوشهٔ `portfolio2` شو:

```bash
cd portfolio2
npm install
npm run dev
```

مرورگر رو باز کن روی `http://localhost:4321`. اگه سایت درست بود، ادامه بده.

برای build تستی:

```bash
npm run build
npm run preview
```

---

## مرحله 2 — ساخت repository روی GitHub

**خیلی مهم**: اسم repo رو **دقیقاً** `<username>.github.io` بذار، همه **حروف کوچیک**، دقیقاً match یوزرنیمت.

مثال: اگه یوزرنیمت `hameddrzi` هست، اسم repo می‌شه: `hameddrzi.github.io`

1. برو به <https://github.com/new>
2. Repository name: `<your-username>.github.io` (lowercase)
3. Public انتخاب کن
4. **هیچ** گزینه‌ای (README/gitignore/license) تیک نزن — خالی باشه
5. Create repository

> چرا اسم دقیقاً این؟ اگه اسم repo با یوزرنیم match باشه، GitHub اون رو **user site** در نظر می‌گیره و روی root یعنی `https://<username>.github.io/` سرو می‌کنه. اگه اسم فرق کنه، می‌شه **project site** در `https://<username>.github.io/<repo>/` و asset path‌ها می‌شکنن.

---

## مرحله 3 — تنظیم Personal Access Token (PAT)

برای push کردن، GitHub دیگه password قبول نمی‌کنه. باید token بسازی:

1. برو به <https://github.com/settings/tokens>
2. Generate new token → **Generate new token (classic)**
3. Note: مثلاً `portfolio-deploy`
4. Expiration: دلخواه (مثلاً 90 روز)
5. Scopes این‌ها رو تیک بزن:
   - ✅ `repo` (کامل)
   - ✅ `workflow` (خیلی مهم — بدون این workflow push نمی‌شه)
6. Generate token
7. توکن رو **کپی** کن و جایی امن ذخیره کن (دیگه نمی‌تونی ببینی).

---

## مرحله 4 — init کردن git و push اول

توی پوشهٔ `portfolio2` ترمینال باز کن:

```bash
cd portfolio2

# اگه قبلاً git init شده بود، این خط رو رد کن
git init

git add .
git commit -m "initial commit"

# تنظیم branch اصلی روی main
git branch -M main

# remote رو اضافه کن (username خودت رو بذار)
git remote add origin https://github.com/<your-username>/<your-username>.github.io.git

git push -u origin main
```

موقع push، ازت username و password می‌خواد:
- **Username**: یوزرنیم GitHub
- **Password**: اون **توکنی** که مرحلهٔ قبل ساختی (نه password اصلی)

---

## مرحله 5 — فعال کردن GitHub Pages با Actions

این مرحله کلیدیه و اگه اشتباه بره سایت سفید می‌شه:

1. برو به repo روی GitHub
2. Settings → Pages (منو سمت چپ)
3. زیر **Build and deployment** → **Source**:
   - گزینه رو بذار روی **GitHub Actions** (نه "Deploy from a branch")
4. Save

> چرا این مهمه؟ workflow ما (`.github/workflows/deploy.yml`) با `actions/deploy-pages@v4` کار می‌کنه. اگه Source روی "Deploy from a branch" باشه، workflow با خطای 404 شکست می‌خوره.

---

## مرحله 6 — صبر کن و تماشا کن

1. برو به tab **Actions** توی repo
2. باید یه workflow به اسم "Deploy Astro site to GitHub Pages" در حال run ببینی
3. بذار تموم بشه (معمولاً 1-2 دقیقه)
4. اگه دو job (`build` و `deploy`) هر دو سبز شدن، سایت آماده‌ست

سایت: `https://<your-username>.github.io/`

---

## مرحله 7 — push‌های بعدی

برای هر تغییری فقط کافیه:

```bash
git add .
git commit -m "پیام تغییرات"
git push
```

workflow خودکار دوباره اجرا می‌شه و سایت update می‌شه.

---

## عیب‌یابی

### سایت سفیده / بدون CSS نمایش می‌ده
- مطمئن شو URL دقیقاً `https://<username>.github.io/` هست، بدون هیچ subpath.
- اگه URL شامل subpath شد (مثلاً `/reponame/`)، یعنی repo اسمش با username match نیست. repo رو rename کن.

### Workflow خطای 404 می‌ده
- Settings → Pages → Source روی **GitHub Actions** ست نشده. تنظیمش کن.

### push با خطای `workflow scope` رد می‌شه
- توکنت scope `workflow` نداره. دوباره token بساز با این scope.

### تغییرات چند دقیقه بعد نشون داده نشدن
- یک hard refresh بزن: `Ctrl+Shift+R` (یا `Cmd+Shift+R`).
- Actions tab رو چک کن workflow تموم شده یا نه.

### node version خطا می‌ده موقع build لوکال
- نیاز به Node 18.17+ یا 20+ داری. با nvm آپدیت کن: `nvm install 20 && nvm use 20`

---

## تنظیم در `astro.config.mjs`

اگه حتماً خواستی repo رو با اسمی غیر از `<username>.github.io` بسازی (یعنی project site)، باید `base` رو ست کنی:

```js
export default defineConfig({
  site: 'https://<username>.github.io',
  base: '/<repo-name>',   // دقیقاً اسم repo
  build: { assets: 'assets' },
});
```

بعد سایت روی `https://<username>.github.io/<repo-name>/` سرو می‌شه.

**توصیه می‌شه این کار رو نکنی** — user site (اسم repo = username) ساده‌تره.
