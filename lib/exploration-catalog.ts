export type InterestDomainId =
  | "nature"
  | "science"
  | "history"
  | "literature"
  | "geography"
  | "art"
  | "math"
  | "life";

export type ExplorationNodeType = "发现" | "观察" | "连接" | "创造";

export type ExplorationLesson = {
  hook: string;
  objective: string;
  illustration: string;
  illustrationAlt: string;
  learnCards: Array<{ title: string; body: string }>;
  quiz: {
    question: string;
    options: string[];
    correctIndex: number;
    success: string;
    hints: string[];
  };
  project: {
    prompt: string;
    placeholder: string;
    criteria: string[];
    rubricKeywords: string[][];
    modelAnswerGuide: string;
  };
  review: {
    question: string;
    placeholder: string;
    rubricKeywords: string[][];
    modelAnswerGuide: string;
  };
};

export type ExplorationNode = {
  id: string;
  domainId: InterestDomainId;
  order: number;
  type: ExplorationNodeType;
  title: string;
  guide: string;
  challenge: string;
  takeaway: string;
  lesson?: ExplorationLesson;
};

export type InterestDomain = {
  id: InterestDomainId;
  title: string;
  shortTitle: string;
  description: string;
  colorClass: string;
  keywords: string[];
  bridges: InterestDomainId[];
  nodes: ExplorationNode[];
};

type NodeSeed = Omit<ExplorationNode, "domainId" | "order">;

function domainNodes(domainId: InterestDomainId, nodes: NodeSeed[]): ExplorationNode[] {
  return nodes.map((node, index) => ({ ...node, domainId, order: index + 1 }));
}

export const interestDomains: InterestDomain[] = [
  {
    id: "nature",
    title: "动物与自然",
    shortTitle: "自然",
    description: "观察动物、植物和地球生命，发现它们各自的生存智慧。",
    colorClass: "domain-nature",
    keywords: ["动物", "植物", "森林", "恐龙", "昆虫", "海洋", "自然", "生态", "化石"],
    bridges: ["science", "geography"],
    nodes: domainNodes("nature", [
      {
        id: "nature-survival",
        type: "发现",
        title: "动物的生存本领",
        guide: "动物没有雨衣、冰箱和空调，却能在沙漠、冰原和深海生活。保护色、迁徙和冬眠，都是它们适应环境的办法。",
        challenge: "选一种你喜欢的动物，说说它最特别的生存本领。如果环境改变了，这个本领还管用吗？",
        takeaway: "动物会用身体特点和行为适应不同的生存环境。",
        lesson: {
          hook: "北极熊没有棉衣，竹节虫也不会真的变成树枝，它们为什么仍能安全生活？",
          objective: "学会从身体特点、行为和环境三方面解释动物怎样生存。",
          illustration: "/assets/exploration/nature/animal-survival.png",
          illustrationAlt: "雪地里的北极熊和北极狐，展示动物的保温与保护色本领",
          learnCards: [
            { title: "身体像一件工具", body: "厚厚的脂肪能保温，宽大的脚掌能防止陷进雪里，尖锐的牙齿适合获取食物。身体特点要和生活环境一起看。" },
            { title: "行为也能帮忙", body: "迁徙、冬眠、夜间活动都是生存办法。动物会在食物、温度或危险发生变化时调整行动。" },
            { title: "环境改变会怎样", body: "一种本领只在合适的环境里有优势。雪地里的白色保护色，到了没有积雪的地方反而可能更显眼。" },
          ],
          quiz: {
            question: "雪地里的白色动物到了没有积雪的深色土地上，最可能发生什么？",
            options: ["更不容易被发现", "保护色的效果会变差", "身体会立刻变成深色", "完全不受环境影响"],
            correctIndex: 1,
            success: "答对啦！生存本领要和环境匹配，环境改变后，原来的优势可能会变弱。",
            hints: ["想想白色在深色背景上显眼不显眼。", "保护色不是任何地方都同样有效。"],
          },
          project: {
            prompt: "选一种动物，说明它的一项生存本领、适合的环境，以及环境改变后可能遇到的问题。",
            placeholder: "例如：我选择……它会……这在……环境里有用。如果环境变成……它可能……",
            criteria: ["说出一种具体动物", "说清一项身体特点或行为", "把本领和环境联系起来", "推测环境改变后的影响"],
            rubricKeywords: [["动物", "熊", "狐", "鸟", "鱼", "虫", "兔", "骆驼", "企鹅"], ["保护色", "冬眠", "迁徙", "脂肪", "脚掌", "翅膀", "夜间", "储水", "保温"], ["环境", "雪", "沙漠", "森林", "海洋", "寒冷", "炎热", "食物"], ["如果", "改变", "变暖", "减少", "困难", "失去", "影响", "不容易"]],
            modelAnswerGuide: "回答应包含具体动物、具体生存本领、适用环境及环境变化后的合理影响，表达方式可以不同。",
          },
          review: {
            question: "不用看前面的内容：为什么不能只说‘白色皮毛很好’，还要说明动物生活在哪里？",
            placeholder: "因为……",
            rubricKeywords: [["环境", "地方", "背景"], ["保护色", "隐藏", "保温", "作用", "优势"], ["匹配", "适合", "改变", "不同"]],
            modelAnswerGuide: "应说明身体特点的作用取决于环境是否匹配，环境不同，同一特点的效果也可能不同。",
          },
        },
      },
      {
        id: "nature-forest-layers",
        type: "观察",
        title: "森林也有楼层",
        guide: "森林从高到低可以分成树冠层、灌木层和地表层。阳光、水分和食物不同，住在每一层的生命也不一样。",
        challenge: "找一张森林图片，从高到低找出三种生命，并猜猜它们为什么住在那里。",
        takeaway: "森林的不同高度形成了不同的生活空间。",
        lesson: {
          hook: "一片森林看起来挤在一起，其实像一栋有阳台、有楼道、也有地下室的大楼。",
          objective: "学会比较森林不同高度的阳光、水分、食物和居住者。",
          illustration: "/assets/exploration/nature/forest-layers.png",
          illustrationAlt: "从树冠到灌木和地表的森林分层，以及生活在不同高度的动物和植物",
          learnCards: [
            { title: "树冠层：阳光最多", body: "高大的树冠接到更多阳光，也有花、果实和嫩叶，许多鸟类和善于攀爬的动物在这里活动。" },
            { title: "灌木层：枝叶更密", body: "较矮的灌木得到的阳光较少，但浓密枝叶适合躲藏、筑巢，也能提供浆果和昆虫。" },
            { title: "地表层：分解发生处", body: "落叶、枯枝和湿润土壤聚在地面，蘑菇、蚯蚓等分解者把旧物质变成植物能再次利用的养分。" },
          ],
          quiz: {
            question: "哪一种生命最可能长期生活在阴暗、湿润、落叶很多的森林地表层？",
            options: ["需要强光的高大树冠叶", "蚯蚓和蘑菇", "一直高空飞行的雨燕", "只在开阔草原奔跑的羚羊"],
            correctIndex: 1,
            success: "答对啦！森林地表湿润、落叶多，正适合许多分解者生活。",
            hints: ["地表层有很多落叶，需要谁来分解？", "找一找喜欢潮湿、弱光环境的生命。"],
          },
          project: {
            prompt: "从树冠层、灌木层、地表层中选两层，各举一种生命，并说明它为什么适合住在那里。",
            placeholder: "在……层，我会找到……因为这里……；在……层，我会找到……因为这里……",
            criteria: ["选出两个不同层次", "每层举出一种合理生命", "说明阳光、水分、食物或隐蔽条件", "把生命需要与楼层条件对应"],
            rubricKeywords: [["树冠", "灌木", "地表"], ["鸟", "松鼠", "昆虫", "灌木", "蘑菇", "蚯蚓", "苔藓", "树"], ["阳光", "水分", "湿润", "食物", "果实", "落叶", "隐蔽", "筑巢"], ["因为", "适合", "需要", "所以"]],
            modelAnswerGuide: "回答应比较至少两个森林层次，各给出合理生命，并用该层的光照、水分、食物或隐蔽条件解释。",
          },
          review: {
            question: "如果森林里高大的树大量消失，灌木层和地表层可能发生什么变化？说出一种并说明原因。",
            placeholder: "可能会……因为……",
            rubricKeywords: [["灌木", "地表", "阳光", "温度", "水分", "动物", "落叶"], ["增加", "减少", "变干", "变热", "改变", "失去"], ["因为", "所以", "遮挡", "树冠"]],
            modelAnswerGuide: "应指出树冠减少会改变下层的光照、温湿度、落叶或动物栖息条件，并说明因果。",
          },
        },
      },
      {
        id: "nature-fossil-time",
        type: "连接",
        title: "化石里的时间",
        guide: "骨骼、脚印甚至树叶都可能变成化石。科学家比较它们所在的岩层，就能一点点还原很久以前的地球。",
        challenge: "假如你发现一枚巨大脚印化石，你会记录哪三条线索来判断它的主人？",
        takeaway: "化石和岩层保存着远古生命与环境的线索。",
        lesson: {
          hook: "没有见过恐龙的人，为什么能知道它走路、吃东西，甚至有时成群活动？",
          objective: "学会把化石、岩层和多条线索组合起来作出有根据的推测。",
          illustration: "/assets/exploration/nature/fossil-evidence.png",
          illustrationAlt: "龟龟在不同岩层旁记录脚印、树叶和骨骼化石线索",
          learnCards: [
            { title: "化石不只有骨头", body: "牙齿、树叶、蛋、粪便和脚印都可能成为化石。不同化石告诉我们的信息并不相同。" },
            { title: "岩层像时间书页", body: "在没有被扰动的岩层中，通常越下面形成得越早。记录化石位于哪一层，才能比较大致年代。" },
            { title: "推测要靠多条证据", body: "脚印大小能帮助估计体型，步距能提示运动方式，附近多个同向脚印可能提示同行，但一条线索不能证明全部结论。" },
          ],
          quiz: {
            question: "发现一串脚印化石时，哪种做法最像科学家的研究方法？",
            options: ["只看最大的一个脚印就下结论", "记录大小、步距、方向和所在岩层后再比较", "先想好答案再挑支持它的线索", "把脚印挖走，不记录发现位置"],
            correctIndex: 1,
            success: "答对啦！可靠的推测来自多条线索和完整记录，而不是一次猜测。",
            hints: ["科学记录不仅要看化石，还要保留位置和岩层信息。", "选择能比较多条证据的做法。"],
          },
          project: {
            prompt: "假如你发现一串巨大脚印化石，列出至少三条要记录的线索，并分别说说它们可能帮助判断什么。",
            placeholder: "我要记录……它能帮助判断……；还要记录……因为……",
            criteria: ["至少三条具体线索", "包含脚印本身的特征", "包含位置、方向或岩层信息", "区分证据和推测，不把猜测说成确定事实"],
            rubricKeywords: [["大小", "长度", "深浅", "形状", "趾", "步距"], ["方向", "数量", "排列", "位置", "岩层", "附近"], ["体型", "速度", "走路", "年代", "成群", "环境"], ["可能", "推测", "比较", "不能确定", "证据"]],
            modelAnswerGuide: "回答应列出至少三条可观察或记录的线索，并把线索与体型、运动、年代或群体活动等合理推测对应；不能只给结论。",
          },
          review: {
            question: "为什么发现一个脚印时，不能马上断定‘这是一只成群生活的动物’？还需要什么证据？",
            placeholder: "因为一个脚印只能说明……还需要……",
            rubricKeywords: [["一个", "单个", "证据不足", "不能"], ["多个", "脚印", "方向", "排列", "同一岩层"], ["比较", "推测", "证据"]],
            modelAnswerGuide: "应说明单个脚印不足以证明群居，还需同层、同方向或有规律的多个个体足迹等证据。",
          },
        },
      },
      {
        id: "nature-design-home",
        type: "创造",
        title: "为动物设计一个家",
        guide: "一个合适的动物之家要考虑温度、食物、水、隐蔽处和活动空间，还要尽量不破坏原来的环境。",
        challenge: "选择一种动物，画出它的新家，并标出食物区、休息区和安全通道。",
        takeaway: "设计动物栖息地需要同时理解生命需求和环境条件。",
        lesson: {
          hook: "给小熊猫造一间很漂亮的玻璃房就够了吗？漂亮是人的感觉，合适才是动物的需要。",
          objective: "学会根据动物的食物、水、温度、活动和安全需要设计栖息地。",
          illustration: "/assets/exploration/nature/animal-habitat.png",
          illustrationAlt: "包含食物、饮水、休息处和安全通道的小熊猫自然栖息地",
          learnCards: [
            { title: "先研究住户", body: "不同动物需要不同食物、温度和活动空间。先了解动物在自然中怎样生活，再开始画房子。" },
            { title: "空间要能连接", body: "食物区、饮水区、休息区和活动区之间要有安全通道，还要有躲避惊吓和天气变化的地方。" },
            { title: "减少人的打扰", body: "合适的家不只是方便参观，还要保留安静区域、自然材料和足够选择，让动物能表现自然行为。" },
          ],
          quiz: {
            question: "为喜欢攀爬、怕热的小熊猫设计新家，哪项最重要？",
            options: ["全部铺成光滑地面方便打扫", "提供树木、高处通道、阴凉处和合适食物", "全天用强灯照亮方便观看", "只放一个漂亮玩具"],
            correctIndex: 1,
            success: "答对啦！设计要从动物的自然行为和生活需要出发。",
            hints: ["小熊猫喜欢做什么，又怕什么？", "合适的栖息地要同时解决活动、温度和食物。"],
          },
          project: {
            prompt: "选择一种动物，用文字设计它的新家：至少说明食物区、休息区、安全通道，再加入一项符合它习性的特别设计。",
            placeholder: "我为……设计。食物区……休息区……安全通道……特别设计是……因为……",
            criteria: ["说出具体动物及生活习性", "包含食物区和休息区", "说明安全通道或隐蔽处", "特别设计能对应动物的真实需要"],
            rubricKeywords: [["动物", "熊猫", "企鹅", "鸟", "鱼", "兔", "猴", "龟", "狐"], ["食物", "饮水", "休息", "睡", "水"], ["通道", "安全", "躲藏", "隐蔽", "围栏", "出口"], ["因为", "习性", "攀爬", "游泳", "保温", "阴凉", "活动", "夜间"]],
            modelAnswerGuide: "回答应针对具体动物，包含食物、休息、安全通道/隐蔽和至少一项符合习性的设计，并说明理由。",
          },
          review: {
            question: "如果一个动物之家很方便游客观看，却没有安静的躲藏处，可能有什么问题？怎样改进？",
            placeholder: "动物可能会……我会增加……因为……",
            rubricKeywords: [["紧张", "害怕", "压力", "休息", "打扰", "不安"], ["躲藏", "隐蔽", "安静", "遮挡", "休息区"], ["因为", "减少", "安全"]],
            modelAnswerGuide: "应说明缺少隐蔽会造成压力或影响休息，并提出增加安静、遮挡、可自由进入的隐蔽空间等改进。",
          },
        },
      },
    ]),
  },
  {
    id: "science",
    title: "科学与太空",
    shortTitle: "科学",
    description: "从月亮、能量到未来基地，用证据解开世界的为什么。",
    colorClass: "domain-science",
    keywords: ["科学", "太空", "宇宙", "月亮", "星球", "实验", "发明", "能源", "机器人"],
    bridges: ["math", "nature"],
    nodes: domainNodes("science", [
      {
        id: "science-moon-phases",
        type: "发现",
        title: "月亮为什么会变样",
        guide: "月亮本身没有变成月牙。它绕地球运动时，被太阳照亮的那一半，从地球看起来会出现不同形状。",
        challenge: "用台灯当太阳、球当月亮，转动小球，观察你能看到几种“月相”。",
        takeaway: "月相来自太阳、地球和月亮位置的变化。",
      },
      {
        id: "science-bioluminescence",
        type: "观察",
        title: "会自己发光的生命",
        guide: "萤火虫、发光水母和一些深海鱼会利用化学反应发光，用来交流、捕食或躲避危险。",
        challenge: "比较两种发光生物：它们在哪里生活，发光分别有什么用？",
        takeaway: "生物发光是生命利用化学能的一种特殊本领。",
      },
      {
        id: "science-renewable-energy",
        type: "连接",
        title: "风和太阳能发电",
        guide: "风推动叶片转动，阳光让太阳能电池产生电流。它们能不断补充，但也会受到天气和时间影响。",
        challenge: "为学校设计一份清洁能源方案：哪些地方适合太阳能，哪些地方适合风能？",
        takeaway: "可再生能源清洁但不稳定，需要合理选择和储存。",
      },
      {
        id: "science-future-base",
        type: "创造",
        title: "设计一座未来基地",
        guide: "在月球或火星生活，需要解决空气、水、食物、温度、能源和通信问题，每个系统都要互相配合。",
        challenge: "画一座未来基地，至少标出四个维持生活的重要系统。",
        takeaway: "太空基地是多个科学与工程系统共同工作的结果。",
      },
    ]),
  },
  {
    id: "history",
    title: "历史与文明",
    shortTitle: "历史",
    description: "从遗迹、古城和发明中，读懂人们怎样创造今天的生活。",
    colorClass: "domain-history",
    keywords: ["历史", "古代", "文明", "遗迹", "考古", "博物馆", "古城", "人物", "发明"],
    bridges: ["geography", "literature"],
    nodes: domainNodes("history", [
      {
        id: "history-ruins-speak",
        type: "发现",
        title: "遗迹也会说话",
        guide: "一块陶片、一段城墙和一枚钱币都能提供线索。历史研究者会比较材料、位置和年代，避免只凭想象下结论。",
        challenge: "假如你找到一只旧碗，你会从形状、材料和发现地点中问出哪些问题？",
        takeaway: "历史结论需要把遗迹中的多条证据连接起来。",
      },
      {
        id: "history-day-in-city",
        type: "观察",
        title: "古城里的一天",
        guide: "城门、街道、市场和水井记录着古人的日常。观察一座古城的布局，也能看见当时的交通、职业和规则。",
        challenge: "选择一座古城，画出一位同龄孩子从早到晚可能经过的三个地方。",
        takeaway: "城市布局能反映一个时代的生活方式。",
      },
      {
        id: "history-inventions",
        type: "连接",
        title: "发明怎样改变生活",
        guide: "纸、印刷术、指南针等发明不仅解决一个问题，还会改变学习、旅行和人与人交流的方式。",
        challenge: "选择一项发明，画出“发明以前”和“发明以后”的生活对比。",
        takeaway: "重要发明常常会带来一连串社会变化。",
      },
      {
        id: "history-letter-future",
        type: "创造",
        title: "给未来写一封历史信",
        guide: "今天的校服、交通和游戏，也会成为未来研究者眼中的历史。记录具体细节，能让未来的人更了解我们。",
        challenge: "写一封给一百年后小朋友的短信，介绍今天最值得保存的三样东西。",
        takeaway: "认真记录当下，就是在为未来保存历史。",
      },
    ]),
  },
  {
    id: "literature",
    title: "文学与故事",
    shortTitle: "文学",
    description: "走进人物和情节，发现故事背后的情感、选择与想象。",
    colorClass: "domain-literature",
    keywords: ["故事", "童话", "文学", "读书", "阅读", "诗", "小说", "人物", "写作"],
    bridges: ["art", "history"],
    nodes: domainNodes("literature", [
      {
        id: "literature-character-choice",
        type: "发现",
        title: "人物为什么这样做",
        guide: "人物的行动通常来自愿望、担心和当时的处境。把这三条线索放在一起，才能真正理解人物。",
        challenge: "从最近读的故事选一个人物，找出他的愿望、困难和一个重要选择。",
        takeaway: "理解人物要同时关注动机、处境和选择。",
      },
      {
        id: "literature-repetition",
        type: "观察",
        title: "童话里的重复魔法",
        guide: "许多童话会重复三次敲门、三次考验或三次回答。重复让读者记得更牢，也让紧张和期待一点点增加。",
        challenge: "找一个有重复情节的故事，说说去掉一次重复后，感觉会有什么不同。",
        takeaway: "重复是故事制造节奏、记忆和期待的重要方法。",
      },
      {
        id: "literature-new-ending",
        type: "连接",
        title: "同一个故事的不同结尾",
        guide: "结尾会改变我们对整个故事的理解。快乐、开放或意外的结尾，会让同一组人物和事件产生不同意义。",
        challenge: "给熟悉的故事换一个结尾，并说明人物需要提前做出什么不同选择。",
        takeaway: "故事结尾会回过头改变读者对情节和人物的理解。",
      },
      {
        id: "literature-science-story",
        type: "创造",
        title: "把科学写成小故事",
        guide: "知识也能成为故事。让一个科学现象变成角色，再给它设置愿望和困难，就能把解释写得生动又准确。",
        challenge: "把“水循环”或“种子发芽”写成一段有角色、有困难的小故事。",
        takeaway: "故事能帮助我们用准确又有趣的方式表达知识。",
      },
    ]),
  },
  {
    id: "geography",
    title: "地理与旅行",
    shortTitle: "地理",
    description: "沿着地图认识山川、气候和不同地方的生活方式。",
    colorClass: "domain-geography",
    keywords: ["旅行", "地图", "地理", "山川", "海洋", "国家", "城市", "气候", "路线"],
    bridges: ["nature", "history"],
    nodes: domainNodes("geography", [
      {
        id: "geography-directions",
        type: "发现",
        title: "地图上的方向秘密",
        guide: "地图用方向、图例和比例尺，把真实世界缩小在纸面上。先找到北方，才能准确描述其他地点的位置。",
        challenge: "画一张从家到学校的简图，加入方向箭头和至少三个图例。",
        takeaway: "方向、图例和比例尺是读懂地图的基本工具。",
      },
      {
        id: "geography-landforms",
        type: "观察",
        title: "山川是怎样形成的",
        guide: "地壳运动能把土地抬高，流水和风又会不断侵蚀、搬运。山谷、峡谷和三角洲都是长期变化的结果。",
        challenge: "观察一种地貌，判断它更可能受到抬升、流水还是风的影响。",
        takeaway: "地貌由地球内部力量和外部侵蚀长期共同塑造。",
      },
      {
        id: "geography-climate-life",
        type: "连接",
        title: "气候怎样改变生活",
        guide: "冷热、降水和季节会影响房屋、衣服、食物与出行。不同地方的生活习惯，常常是在适应当地环境。",
        challenge: "比较一个寒冷地区和一个炎热地区的房屋，找出两处不同并解释原因。",
        takeaway: "气候会影响人们的居住、饮食和出行方式。",
      },
      {
        id: "geography-route-plan",
        type: "创造",
        title: "设计一条旅行路线",
        guide: "一条好路线要考虑距离、交通、天气、时间和想看的内容，还要给休息与意外情况留下空间。",
        challenge: "为两天小旅行安排三站路线，说明顺序和每一站的选择理由。",
        takeaway: "旅行规划需要综合位置、时间、条件和个人兴趣。",
      },
    ]),
  },
  {
    id: "art",
    title: "艺术与创造",
    shortTitle: "艺术",
    description: "用颜色、声音和图案表达想法，把知识变成自己的作品。",
    colorClass: "domain-art",
    keywords: ["画画", "艺术", "音乐", "颜色", "手工", "设计", "创作", "图案", "摄影"],
    bridges: ["literature", "math"],
    nodes: domainNodes("art", [
      {
        id: "art-color-emotion",
        type: "发现",
        title: "颜色也有情绪",
        guide: "颜色本身没有固定情绪，但明暗、冷暖和搭配会影响我们的感受。同一种红色放在不同画面里，也可能热闹或紧张。",
        challenge: "只用三种颜色画“安静”和“兴奋”两幅小画，并比较你的选择。",
        takeaway: "颜色的明暗、冷暖和搭配能帮助作品表达情绪。",
      },
      {
        id: "art-rhythm",
        type: "观察",
        title: "声音里的节奏",
        guide: "长短、强弱和停顿组成节奏。雨滴、脚步和说话里都有节奏，音乐家会把它们组织成可以重复的模式。",
        challenge: "用拍手和桌面敲击设计一组八拍节奏，再教给别人重复。",
        takeaway: "节奏是声音按照时间形成的规律。",
      },
      {
        id: "art-pattern-math",
        type: "连接",
        title: "图案中的数学规律",
        guide: "窗花、织物和建筑装饰常用平移、旋转与对称。数学规律让图案既统一，又能不断变化。",
        challenge: "选择一个简单形状，用平移或旋转设计一条连续花边。",
        takeaway: "对称、平移和旋转能创造有规律的艺术图案。",
      },
      {
        id: "art-card-cover",
        type: "创造",
        title: "设计一张知识卡封面",
        guide: "知识卡封面要让人一眼看懂主题。醒目的标题、主要画面和少量辅助元素，比塞满信息更有效。",
        challenge: "挑一个刚学会的知识点，为它画封面，并说说你最想让人先看到什么。",
        takeaway: "视觉设计要用清楚的层次突出最重要的信息。",
      },
    ]),
  },
  {
    id: "math",
    title: "数学与逻辑",
    shortTitle: "数学",
    description: "寻找规律、比例和数据，让思考变得清楚又有力量。",
    colorClass: "domain-math",
    keywords: ["数学", "数字", "规律", "逻辑", "计算", "几何", "数据", "比例", "推理"],
    bridges: ["science", "art"],
    nodes: domainNodes("math", [
      {
        id: "math-pattern-detective",
        type: "发现",
        title: "做一个规律侦探",
        guide: "规律不只藏在数字里，也藏在形状、动作和声音中。找到重复单位，再观察它怎样变化，就能预测下一步。",
        challenge: "自己设计一串至少有两层规律的符号，让家人猜下一个是什么。",
        takeaway: "识别重复单位和变化方式能帮助我们发现规律。",
      },
      {
        id: "math-scale-world",
        type: "观察",
        title: "比例怎样缩小世界",
        guide: "地图和模型不能和真实物体一样大，所以会用相同的比例缩小。比例保持不变，形状和距离关系才不会走样。",
        challenge: "把一张桌子的长和宽都缩小十倍，画出它的平面小模型。",
        takeaway: "按同一比例缩放能保持物体各部分的关系。",
      },
      {
        id: "math-data-story",
        type: "连接",
        title: "数据也能讲故事",
        guide: "一组数字看起来很安静，整理成表格或图表后，就能看出最多、最少、变化和例外。但图表也要说明数据从哪里来。",
        challenge: "记录一周天气，用图表展示，并说出你发现的一个趋势。",
        takeaway: "整理和比较数据可以发现趋势，也要留意数据来源。",
      },
      {
        id: "math-fair-game",
        type: "创造",
        title: "设计一个公平游戏",
        guide: "如果每位玩家获胜的机会一样，游戏才算公平。转盘、骰子和抽卡的规则，可以用可能结果的数量来检查。",
        challenge: "设计一个两人小游戏，列出所有可能结果，证明双方机会一样。",
        takeaway: "公平游戏需要让参与者拥有相同的获胜可能。",
      },
    ]),
  },
  {
    id: "life",
    title: "生活与社会",
    shortTitle: "生活",
    description: "认识情绪、合作和社会运行，练习解决真实生活里的问题。",
    colorClass: "domain-life",
    keywords: ["生活", "朋友", "情绪", "合作", "社会", "食物", "沟通", "家庭", "社区"],
    bridges: ["history", "geography"],
    nodes: domainNodes("life", [
      {
        id: "life-emotion-weather",
        type: "发现",
        title: "我的情绪天气",
        guide: "情绪像天气一样会变化。给它准确命名，再观察身体感觉和发生的事情，能帮助我们选择更合适的行动。",
        challenge: "用晴、阴、雨、风描述今天三次情绪变化，并找出每次变化前发生了什么。",
        takeaway: "识别情绪、身体信号和原因能帮助我们调节行动。",
      },
      {
        id: "life-listening",
        type: "观察",
        title: "倾听让合作更容易",
        guide: "真正的倾听不只是安静，还包括看着对方、抓住重点和确认自己有没有理解。这样能减少误会。",
        challenge: "听家人讲一分钟，再用“你的意思是……”复述，请对方给你打分。",
        takeaway: "复述和确认是有效倾听的重要方法。",
      },
      {
        id: "life-food-journey",
        type: "连接",
        title: "一份食物的长途旅行",
        guide: "一只苹果从果园到餐桌，要经过种植、采收、运输、销售和保存。每一步都有人工作，也会使用资源。",
        challenge: "选择一种食物，画出它到达餐桌前至少四站的旅行图。",
        takeaway: "日常食物连接着生产、运输、销售和资源使用。",
      },
      {
        id: "life-friendly-community",
        type: "创造",
        title: "设计一个友好小社区",
        guide: "友好社区要让儿童、老人和行动不便的人都能安全使用，还要有交流、休息和亲近自然的空间。",
        challenge: "画一个小社区，加入三处照顾不同人需要的设计，并写出理由。",
        takeaway: "公共空间设计要看见不同人的真实需要。",
      },
    ]),
  },
];

export const explorationNodes = interestDomains.flatMap((domain) => domain.nodes);

export function interestDomainById(domainId: InterestDomainId | string) {
  return interestDomains.find((domain) => domain.id === domainId);
}

export function explorationNodeById(nodeId: string) {
  return explorationNodes.find((node) => node.id === nodeId);
}
