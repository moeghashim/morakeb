<div dir="rtl" align="center">
  <strong>مراقب</strong> هو أداة مراقبة تغييرات المحتوى المستضافة ذاتيًا مع واجهة طرفية.<br />
  تتبع الصفحات والخلاصات وواجهات برمجة التطبيقات؛ احصل على فروقات قابلة للقراءة وملخصات ذكية اختيارية.

  <br /><br />
  <em>
    صفحات الويب • Markdown • JSON • XML/Atom
    <br />
    فروقات قابلة للقراءة • ملخصات ذكية • إشعارات
  </em>
</div>

<div align="center">
  <strong>Morakeb</strong> is a self‑hosted content change monitor with a TUI.<br />
  Track pages, feeds, and APIs; get readable diffs and optional AI summaries.

  <br /><br />
  <em>
    Webpages • Markdown • JSON • XML/Atom
    <br />
    Readable diffs • AI summaries • Notifications
  </em>
</div>

---

## حالة المشروع / Project Status

<div dir="rtl">

**الإصدار الحالي:** 0.1.0  
**المستودع:** [https://github.com/moeghashim/morakeb](https://github.com/moeghashim/morakeb)  
**النشر على Cloudflare:** [https://morakeb.moe-3b7.workers.dev](https://morakeb.moe-3b7.workers.dev)

### ✅ الميزات المنجزة

- **المراقبة:** صفحات الويب، واجهات برمجة التطبيقات (JSON)، Markdown، خلاصات XML/Atom
- **الملخصات الذكية:** 
  - **النموذج الافتراضي:** Gemini Flash (Google) - لا يتطلب مفاتيح API عند الاستضافة على Cloudflare
  - دعم مقدمي خدمات آخرين: Anthropic Claude، OpenAI، Google Gemini
  - ملخصات شاملة للتغييرات باللغة العربية
  - تضمين جميع عناصر سجل التغييرات (بدون اقتطاع)
  - عرض أرقام الإصدارات بشكل صحيح في النص العربي
- **الإشعارات:** 
  - Telegram (مكتمل)
  - Instagram (تنفيذ أساسي)
- **واجهة طرفية:** واجهة طرفية كاملة لإدارة المراقبات والإعدادات
- **قاعدة البيانات:** SQLite مع Drizzle ORM، دعم الترحيلات
- **المهام الخلفية:** فحوصات متوازية مع قفل المهام
- **الاحتفاظ:** قابل للتكوين للصور الفورية والتغييرات

### 🚧 قيد التطوير / مخطط

- **Cloudflare Workers:** البنية الأساسية منشورة، يحتاج إعادة هيكلة قاعدة البيانات لتوافق D1
- **نظام الطوابير:** تكامل Cloudflare Queues (يتطلب خطة مدفوعة)
- **مشغلات Cron:** فحوصات مجدولة للمراقبات (البنية جاهزة)

</div>

**Current Version:** 0.1.0  
**Repository:** [https://github.com/moeghashim/morakeb](https://github.com/moeghashim/morakeb)  
**Cloudflare Deployment:** [https://morakeb.moe-3b7.workers.dev](https://morakeb.moe-3b7.workers.dev) (Placeholder - DB refactoring pending)

### ✅ Implemented Features

- **Monitoring:** Webpages, APIs (JSON), Markdown, XML/Atom feeds
- **AI Summaries:** 
  - **Default Model:** Gemini Flash (Google) - No API keys required when hosted on Cloudflare
  - Other providers supported: Anthropic Claude, OpenAI, Google Gemini
  - Comprehensive changelog summarization in Arabic
  - All changelog items included (no truncation)
  - LTR version numbers in RTL Arabic text
- **Notifications:** 
  - Telegram (fully implemented)
  - Instagram (basic implementation)
- **TUI:** Full-featured terminal UI for managing monitors and settings
- **Database:** SQLite with Drizzle ORM, migrations supported
- **Background Jobs:** Parallel monitor checks with job locking
- **Retention:** Configurable snapshot and change retention

### 🚧 In Progress / Planned

- **Cloudflare Workers:** Basic structure deployed, DB refactoring needed for D1 compatibility
- **Queue System:** Cloudflare Queues integration (requires paid plan)
- **Cron Triggers:** Scheduled monitor checks (structure ready)

---

## البدء السريع / Quick Start

<div dir="rtl">

المتطلبات: Bun 1.3+، SQLite (مضمن مع Bun)، shell.

استنساخ وتثبيت:
```bash
git clone https://github.com/moeghashim/morakeb.git
cd morakeb
bun install
```

إعداد البيئة وقاعدة البيانات:
```bash
bun setup:local
```

تشغيل الخدمة والواجهة الطرفية (التطوير المحلي):
```bash
bun dev
```

في طرفية أخرى:
```bash
bun morakeb
```

</div>

Requirements: Bun 1.3+, SQLite (bundled with Bun), a shell.

Clone and install:
```bash
git clone https://github.com/moeghashim/morakeb.git
cd morakeb
bun install
```

Setup env and database:
```bash
bun setup:local
```

Run the service and TUI (local dev):
```bash
bun dev
```

In another terminal:
```bash
bun morakeb
```

---

## الميزات / Features

<div dir="rtl">

### المراقبة
- المراقبات: صفحات الويب، واجهات برمجة التطبيقات (JSON)، Markdown، خلاصات XML/Atom
- تحويل HTML→Markdown للفرق المستقر
- نظام المكونات الإضافية للخلاصات المتخصصة (إصدارات GitHub، خلاصات Atom)
- الحد الأقصى لحجم الجلب: 5 ميجابايت (يتم تخطي الصفحات الكبيرة)

### الملخصات الذكية
- **النموذج الافتراضي:** Gemini Flash (Google) - سريع واقتصادي
- **مقدمون آخرون:** Anthropic Claude، OpenAI، Google Gemini
- التكوين عبر الواجهة الطرفية → الإعدادات (المزود/النموذج، التحقق من المفاتيح)
- **التحسينات الأخيرة:**
  - تضمين جميع عناصر سجل التغييرات (بدون حد 5 عناصر)
  - عرض أرقام الإصدارات بشكل صحيح في تنسيق LTR داخل النص العربي RTL
  - ملخصات عربية جذابة مع نقاط مختصرة وموجهة للعمل
  - تصفية المادية للتركيز على التغييرات الموجهة للمستخدم

### الإشعارات
- **Telegram:** مكتمل التنفيذ مع تنسيق HTML
- **Instagram:** تنفيذ أساسي (قيود نافذة الرسائل 24 ساعة)
- إدارة القنوات عبر الواجهة الطرفية
- دعم الإشعارات الفورية والملخصات الأسبوعية

### نظرة عامة على الواجهة الطرفية

ابدأ:
```bash
bun morakeb
```

التنقل:
- **المراقبات:** إضافة → قائمة → تفاصيل → ربط قناة إشعار
- **الإعدادات:** اختر مزود/نموذج الذكاء الاصطناعي، تحقق من المفاتيح، تفعيل/تعطيل الملخصات
- **التحكم:** ↑/↓ للتنقل، Enter للتحديد، ESC/← للرجوع، q للخروج

</div>

### Monitoring
- Monitors: webpages, APIs (JSON), Markdown, XML/Atom feeds
- HTML→Markdown conversion for stable diffing
- Plugin system for specialized feeds (GitHub releases, Atom feeds)
- 5 MB max fetch size (oversize pages are skipped)

### AI Summaries
- **Default Model:** Gemini Flash (Google) - Fast and cost-effective
- **Other Providers:** Anthropic Claude, OpenAI, Google Gemini
- Configure in TUI → Settings (provider/model, verify keys)
- **Recent Improvements:**
  - All changelog items are included (no 5-item limit)
  - Version numbers display correctly in LTR format within RTL Arabic text
  - Engaging Arabic summaries with concise, action-oriented bullets
  - Materiality filtering to focus on user-facing changes

### Notifications
- **Telegram:** Fully implemented with HTML formatting
- **Instagram:** Basic implementation (24-hour messaging window limitation)
- Channel management via TUI
- Support for immediate and weekly digest notifications

### TUI Overview

Start:
```bash
bun morakeb
```

Navigation:
- **Monitors:** Add → List → Detail → Link notification channel
- **Settings:** Choose AI provider/model, verify keys, enable/disable summaries
- **Controls:** ↑/↓ to navigate, Enter to select, ESC/← to go back, q to quit

---

## التطوير المحلي / Local Development

<div dir="rtl">

```bash
bun dev          # بدء خادم التطوير مع وضع المراقبة
bun typecheck    # فحص أنواع TypeScript
bun test         # تشغيل مجموعة الاختبارات
bun build        # بناء للإنتاج
```

</div>

```bash
bun dev          # Start dev server with watch mode
bun typecheck    # Type check TypeScript
bun test         # Run test suite
bun build        # Build for production
```

---

## خيارات النشر / Deployment Options

<div dir="rtl">

### النشر على VPS

إنشاء ونشر في خطوة واحدة:
```bash
bun setup:vps
```

يشمل المطالبات:
- مفتاح API لـ Hetzner
- اسم الخادم، المنطقة، الحجم
- مسار التثبيت
- مفتاح SSH
- النشر التلقائي على GitHub (اختياري)

بعد النشر:
```bash
bun morakeb --remote
```

### Cloudflare Workers

**الحالة:** البنية الأساسية منشورة، إعادة هيكلة قاعدة البيانات معلقة

يتضمن المشروع دعم Cloudflare Workers:
- نقطة دخول Worker: `src/cloudflare/index.ts`
- التكوين: `wrangler.toml`
- ربط قاعدة بيانات D1 مُكوّن
- مشغلات Cron مُكوّنة (يوميًا في منتصف الليل UTC)

**القيود الحالية:** فئة DB تستخدم طرق Bun SQLite المتزامنة وتحتاج إعادة هيكلة لعمليات D1 غير المتزامنة.

**النشر:**
```bash
wrangler deploy
```

**GitHub Actions:** سير عمل النشر التلقائي مُكوّن (`.github/workflows/deploy-cloudflare.yml`). يتطلب أسرار GitHub:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**النموذج الافتراضي:** عند الاستضافة على Cloudflare، يستخدم المشروع Gemini Flash افتراضيًا - لا حاجة لمفاتيح API.

</div>

### VPS Deployment

Create and deploy in one flow:
```bash
bun setup:vps
```

Prompts include:
- Hetzner API key
- Server name, region, size
- Install path
- SSH key
- GitHub auto‑deploy (optional)

After deployment:
```bash
bun morakeb --remote
```

### Cloudflare Workers

**Status:** Basic structure deployed, DB refactoring pending

The project includes Cloudflare Workers support:
- Worker entry point: `src/cloudflare/index.ts`
- Configuration: `wrangler.toml`
- D1 database binding configured
- Cron triggers configured (daily at midnight UTC)

**Current Limitation:** The DB class uses synchronous Bun SQLite methods and needs refactoring for async D1 operations.

**Deployment:**
```bash
wrangler deploy
```

**GitHub Actions:** Auto-deploy workflow configured (`.github/workflows/deploy-cloudflare.yml`). Requires GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Default Model:** When hosted on Cloudflare, the project uses Gemini Flash by default - no API keys required.

---

## البيانات والنسخ الاحتياطي / Data & Backups

<div dir="rtl">

- SQLite في `data/changes.db` (وضع WAL)
- النسخ الاحتياطي مع ملفات `-wal` و `-shm` الجانبية إذا كان يعمل مباشرة
- ترحيلات قاعدة البيانات عبر Drizzle Kit

</div>

- SQLite at `data/changes.db` (WAL mode)
- Back up with `-wal` and `-shm` side files if running live
- Database migrations via Drizzle Kit

---

## التحديثات الأخيرة / Recent Updates

<div dir="rtl">

- **ملخصات سجل التغييرات:** تحسين لتضمين جميع العناصر من سجلات التغييرات، وليس فقط أفضل 5
- **عرض الإصدار:** أرقام الإصدارات تعرض الآن بشكل صحيح في تنسيق LTR داخل النص العربي RTL
- **الملخصات العربية:** نمط محسّن مع نقاط جذابة ومختصرة (5-10 كلمات)
- **قنوات الإشعارات:** إضافة دعم Instagram (تنفيذ أساسي)
- **النموذج الافتراضي:** Gemini Flash (Google) - سريع واقتصادي

</div>

- **Changelog Summarization:** Improved to include all items from changelogs, not just top 5
- **Version Display:** Version numbers now display correctly in LTR format within RTL Arabic text
- **Arabic Summaries:** Enhanced style with engaging, concise bullets (5-10 words)
- **Notification Channels:** Added Instagram support (basic implementation)
- **Default Model:** Gemini Flash (Google) - Fast and cost-effective

---

## الترخيص / License

MIT

## المساهمة / Contributing

<div dir="rtl">

- حافظ على التغييرات مركزة وآمنة النوع
- أضف اختبارات للسلوك الجديد
- استخدم سجلات مؤرخة ودنيا (بدون رموز تعبيرية)
- اتبع الأنماط في `AGENTS.md` لسير عمل التطوير

</div>

- Keep changes focused and type‑safe
- Include tests for new behavior
- Use timestamped, minimal logs (no emojis)
- Follow the patterns in `AGENTS.md` for development workflow
