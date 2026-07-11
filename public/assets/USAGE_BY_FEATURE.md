# 龟龟伴读 V1.2 美术资产使用对照

页面优先加载 `optimized/` 下的 WebP；同名 PNG 作为原始美术源文件保留。顶部品牌使用 `legacy/brand/guigu_logo.png`。

## 主场景

- 背景：`optimized/backgrounds/main_home.webp`
- 默认乌龟：`characters/turtle/turtle_idle_front.png` 或 `characters/turtle/turtle_idle_standing.png`
- 打招呼/聊天入口：`characters/turtle/turtle_waving.png`
- 状态栏图标：
  - 饥饿值：`icons/status/status_hunger.png`
  - 干净值：`icons/status/status_cleanliness.png`
  - 心情值：`icons/status/status_mood.png`
  - 无聊指数：`icons/status/status_boredom.png`

## 吃果子

- 单个果子：`objects/fruit_red.png`、`objects/fruit_orange.png`、`objects/fruit_blue.png`
- 果篮：`objects/fruit_basket.png`
- 果树隐藏/果树参考：`objects/fruit_tree_peek.png`
- 吃果子动作：`characters/turtle/turtle_eating_fruit.png`
- 饿了提示：`characters/turtle/turtle_hungry.png`
- 吃饱反馈：`characters/turtle/turtle_satisfied.png`

## 游泳清洁

- 游泳动作：`characters/turtle/turtle_swimming.png`
- 洗澡泡泡动作：`characters/turtle/turtle_bathing.png`
- 水波效果：`objects/water_swim_ripple.png`
- 干净反馈：`characters/turtle/turtle_clean_sparkle.png`
- 脏了状态：`characters/turtle/turtle_dirty.png` 或 `characters/turtle/turtle_sad_dirty.png`

## 捉迷藏

- 水里隐藏：`characters/turtle/turtle_hide_water.png`
- 树后隐藏：`characters/turtle/turtle_hide_tree_behind.png`
- 荷叶下隐藏：`characters/turtle/turtle_hide_lotus.png`
- 树上隐藏：`characters/turtle/turtle_hide_tree_top.png`
- 可点击隐藏点物件：
  - `objects/lotus_hide_spot.png`
  - `objects/tree_hide_spot.png`
  - `objects/fruit_tree_peek.png`

## 读书陪伴

- 背景：`optimized/backgrounds/reading_room.webp`
- 书籍封面：
  - `books/book_forest_story.png`
  - `books/book_ocean_note.png`
  - `books/book_dino_knowledge.png`
- 读书动作：`characters/turtle/turtle_reading.png`
- 提问动作：`characters/turtle/turtle_reading_question.png`
- 提问气泡：`ui/speech_bubble_question.png`
- 阅读总结卡片：`ui/reading_summary_card.png`

## 日常聊天

- 说话：`characters/turtle/turtle_talking.png`
- 思考：`characters/turtle/turtle_thinking.png`
- 开心：`characters/turtle/turtle_happy_hearts.png` 或 `characters/turtle/turtle_excited.png`
- 低落：`characters/turtle/turtle_low_mood.png`
- 无聊：`characters/turtle/turtle_bored_sitting.png`
- 对话气泡：`ui/speech_bubble_question.png`

## 外出旅行

- 旅行地图：`optimized/backgrounds/travel_map.webp`
- 地图地点图：
  - `legacy/travel/location_beach.png`
  - `legacy/travel/location_forest.png`
  - `legacy/travel/location_museum.png`
  - `legacy/travel/location_space.png`
  - `legacy/travel/location_future_station.png`
- 旅行票：`legacy/travel/travel_ticket.png`
- 出发动作：`characters/turtle/turtle_travel_start.png`
- 返回动作：`characters/turtle/turtle_travel_return.png`
- 旅行照片：
  - `optimized/travel/photos/photo_beach.webp`
  - `optimized/travel/photos/photo_forest.webp`
  - `optimized/travel/photos/photo_museum.webp`
  - `legacy/travel/location_space.png`（太空站 V1.2 正式地点图）
  - `legacy/travel/location_future_station.png`（未来交通站 V1.2 地点图）
- 知识卡：
  - `optimized/travel/knowledge_cards/knowledge_tide.webp`
  - `optimized/travel/knowledge_cards/knowledge_tree_ring.webp`
  - `optimized/travel/knowledge_cards/knowledge_dinosaur.webp`
  - 太空站知识卡由页面使用地点插画和结构化知识文本生成。
  - 未来交通站知识卡由页面使用地点插画和结构化知识文本生成。
- 知识卡入口图标：`legacy/icons/knowledge_card.png`
- 奖励弹窗：`ui/reward_popup_frame.png`

## 睡觉

- 睡觉动作：`characters/turtle/turtle_sleeping.png`
- 建议放置位置：主场景山洞/小窝附近。

## 后续精修方向

- 太空站和未来交通站功能已经完整，可继续补绘独立旅行照片和同系列整图知识卡以提升收藏质感。
- 如果要做更强交互，主场景中的果树、池塘、山洞、小桌子建议从背景里分层拆出。
- 如果要做动画，建议让美术按同一画布尺寸补关键帧，而不是只用当前静态图缩放。
