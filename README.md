# 龟龟伴读 · Guigu Reading Companion

面向小学生的电子宠物学习陪伴应用。用户可以在像素风家园里照顾小乌龟，并通过读书、错题复习、聊天和旅行留下成长记录。

> **本项目以 MIT 协议开源。**
> 仓库**不包含任何受版权保护的书籍文本与扫描页图**——书籍请通过管理后台「图书导入」自行上传。
> 演示账号均为匿名化的 `同学一` ~ `同学七`，不含任何真实儿童信息。

## 功能

- 四项宠物状态：饱腹、干净、有趣、心情；喂果子、游泳清洁、捉迷藏、睡觉
- 阅读器：章节/分页排版、字号调节、伴读提问、知识卡、朗读音频与逐页跟读
- 一级导航错题屋：拍照/上传即自动归档、照片留档、复习与掌握奖励
- 日常聊天：DeepSeek 驱动、动态宠物人设、儿童友好的安全兜底
- 六个星级解锁旅行地点、旅行票库存、限时旅行、照片与知识卡奖励
- 旅行手账、阅读记录、小背包；宠物改名与本机进度保存
- 家长中心：阅读报告、AI 伴读建议、账号与设备管理
- 管理后台：图书导入、账号管理、审计日志

## 技术栈

| 领域 | 选型 |
|---|---|
| 框架 | Next.js 16（`vinext`）+ React 19 + TypeScript |
| 部署 | Cloudflare Workers / D1 / R2，也支持普通 Node 服务器 + SQLite |
| 数据层 | Drizzle ORM + SQLite |
| 文本模型 | DeepSeek（日常聊天）、小米 MiMo（错题识别） |
| 语音 | 火山引擎豆包：语音识别 + 长文本合成 |
| 客户端 | Web + Android 平板壳 |

## 本地运行

```bash
npm install
npm run dev
```

打开开发服务显示的本地地址即可体验。**不需要任何 API Key 就能完整体验**——未配置密钥时，聊天与阅读反馈走本地安全兜底回复。

需要云端能力（AI 聊天、错题识别、语音）时：

```bash
cp .env.example .env.local
# 填入 DEEPSEEK_API_KEY / MIMO_API_KEY / VOLC_SPEECH_* 等
```

所有密钥只在服务端读取，不会进入浏览器。

### 演示账号

本地开发预置 7 组学生/家长账号：`同学一` ~ `同学七` / `同学一家长` ~ `同学七家长`，初始密码 `123456`，**首次登录强制改密**。

生产环境**不会**自动创建这些账号——只有显式设置 `SEED_INITIAL_STUDENT_ACCOUNTS=1` 才会创建。真实账号请在管理后台添加。

## 导入书籍

仓库不内置受版权保护的书籍文本。两条路径：

**1. 管理后台导入（推荐，运行时）**

登录 `/admin` → 「图书导入」，上传书稿后校验、发布即可。导入的书籍进入数据库，学生端书架按年级展示。

**2. 本地构建流水线（开发者批量处理扫描件）**

```bash
python scripts/import_classic_books.py --source-root <你的书稿目录>
```

产物写入 `public/books/classics/`、`public/assets/books/classics/`，并更新 `app/classic-books-manifest.json`。
**这两个输出目录已在 `.gitignore` 中——请自行确认书稿授权后再分发。**

### 预生成朗读音频

```bash
npm run audio:generate -- --books scripts/book-audio-books.json
```

配置格式见 `scripts/book-audio-books.example.json`：

```json
[{ "id": "<bookId>", "file": "<相对仓库根目录的 .md 路径>" }]
```

## 环境变量

完整清单见 [`.env.example`](./.env.example)。要点：

- `DEEPSEEK_API_KEY` / `MIMO_API_KEY` / `VOLC_SPEECH_*` / `VOLC_TTS_*`：服务端密钥，不下发浏览器
- `SEED_INITIAL_STUDENT_ACCOUNTS`：仅首次初始化测试环境时临时设为 `1`，生产创建账号后移除
- `MODEL_CONFIG_ENCRYPTION_KEY`：加密存储的模型配置
- `AUTH_STORE_FILE` / `USER_STATE_FILE` / `MISTAKE_IMAGE_DIR` / `READING_PROGRESS_FILE` / `STUDENT_MEMORY_FILE`：非 Cloudflare 部署时的本地持久化路径

## 验证

```bash
npm run lint
npm test
```

测试覆盖账号隔离、密码重置、错题 OCR 边界、家长报告、知识探险、排行榜、后台导入与审计等 26 项。

## 素材与授权

- `public/assets/` 下的像素美术与 `public/audio/music/provided/` 下的音乐、音效由项目作者创作，随本仓库以 MIT 协议分发
- **书籍文本与扫描页图不随仓库分发**，需自行准备并确认授权
- `public/assets/ASSET_MANIFEST.md` 是素材清单，`public/assets/USAGE_BY_FEATURE.md` 是素材与功能的对照表

## 目录约定

- `app/` 页面与 API 路由（`app/api/` 为服务端接口）
- `db/` 数据访问层与 Drizzle schema
- `lib/` 领域逻辑（阅读上下文、伴读、语音、家长报告等）
- `public/` 静态资源
- `scripts/` 素材、音频与文档构建脚本
- `tests/` Node 原生测试

## 许可

[MIT](./LICENSE)
