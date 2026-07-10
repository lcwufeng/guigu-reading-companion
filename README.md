# 龟龟伴读

面向小学生的电子宠物学习陪伴应用。用户可以在像素风家园里照顾小乌龟，并通过读书、聊天和旅行留下成长记录。

## V1.1 功能

- 四项宠物状态：饱腹、干净、有趣、心情
- 喂果子、游泳清洁、四处捉迷藏、睡觉
- 三本内置短篇、阅读提问、语音或文字回答、阅读总结
- 日常学习聊天和儿童友好的引导回复
- 四个旅行地点、限时旅行、照片与知识卡奖励
- 旅行手账、阅读记录、小背包
- 宠物改名和本机进度保存

## 本地运行

```bash
npm install
npm run dev
```

打开开发服务显示的本地地址即可体验。

聊天与阅读反馈默认带有本地安全回复，可直接运行。需要启用云端陪伴回复时：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写 `OPENAI_API_KEY`。服务端只发送当前一次分享或阅读回答，并设置 `store: false`；密钥不会进入浏览器。

## 验证

```bash
npm run lint
npm test
```

产品与素材说明见 `public/assets/ASSET_MANIFEST.md` 和 `public/assets/USAGE_BY_FEATURE.md`。完整 PRD 位于同级 Documents 目录的 `龟龟伴读/` 文件夹。
