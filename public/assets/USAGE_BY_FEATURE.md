# 龟龟伴读 V1 美术资产使用对照

## 主场景

- 背景：`backgrounds/main_home.png`
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

- 背景：`backgrounds/reading_room.png`
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

- 旅行地图：`backgrounds/travel_map.png`
- 出发动作：`characters/turtle/turtle_travel_start.png`
- 返回动作：`characters/turtle/turtle_travel_return.png`
- 旅行照片：
  - `travel/photos/photo_beach.png`
  - `travel/photos/photo_forest.png`
  - `travel/photos/photo_museum.png`
  - `travel/photos/photo_observatory_placeholder.png`
- 知识卡：
  - `travel/knowledge_cards/knowledge_tide.png`
  - `travel/knowledge_cards/knowledge_tree_ring.png`
  - `travel/knowledge_cards/knowledge_dinosaur.png`
- 奖励弹窗：`ui/reward_popup_frame.png`

## 睡觉

- 睡觉动作：`characters/turtle/turtle_sleeping.png`
- 建议放置位置：主场景山洞/小窝附近。

## 后续需要正式补绘

- 第四个旅行地点的正式照片和知识卡，目前 `photo_observatory_placeholder.png` 是占位图。
- 如果要做更强交互，主场景中的果树、池塘、山洞、小桌子建议从背景里分层拆出。
- 如果要做动画，建议让美术按同一画布尺寸补关键帧，而不是只用当前静态图缩放。
