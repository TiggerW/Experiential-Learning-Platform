/**
 * 小學四年級體驗學習技能目錄
 * - libraryOnly: 僅供教師手動指派，不會自動推斷
 * - objectivePrefixes / objectiveCodes: 對應課程學習重點
 * - keywords: 描述文字觸發詞
 */

const SKILL_CATALOG = [
  {
    key: "observation",
    name: "觀察力",
    description: "能運用感官與影像，仔細留意環境、建築與自然細節。",
    category: "core",
    objectivePrefixes: ["4.SA.", "4.L"],
    objectiveCodes: ["4.LD.1-1", "4.LD.2-1", "4.LE.3-1"],
    keywords: ["觀察", "看到", "留意", "發現", "注意到", "照片", "圖片", "視覺", "聽覺", "嗅覺"],
    senseMarkers: true,
    requiresImageWithText: true,
  },
  {
    key: "culture",
    name: "文化認識",
    description: "理解本地歷史、文化遺產與社區生活的價值。",
    category: "humanities",
    objectivePrefixes: ["4.3.", "4.4.", "4.5."],
    keywords: ["文化", "歷史", "古蹟", "文物", "傳統", "保育"],
  },
  {
    key: "reflection",
    name: "反思能力",
    description: "能整理學習經歷，思考自己學到了什麼。",
    category: "core",
    objectiveCodes: ["4.SA.3-1"],
    keywords: ["反思", "感想", "學到", "明白", "體會", "原來", "之後", "回家後"],
    postTripOnly: true,
    allowsFeedback: true,
  },
  {
    key: "expression",
    name: "表達溝通",
    description: "能以文字或口述，清楚表達感受與學習所得。",
    category: "core",
    objectiveCodes: ["4.3.5-1", "4.8.1-1", "4.8.2-1"],
    keywords: ["感受", "形容", "描述", "體驗", "我覺得", "我認為", "文字", "表達"],
    minDescriptionLength: 40,
  },
  {
    key: "heritage_conservation",
    name: "文化保育意識",
    description: "認識保育歷史建築與文物的重要性，珍惜社區遺產。",
    category: "humanities",
    objectiveCodes: ["4.3.3-1", "4.3.2-2"],
    objectivePrefixes: ["4.3.3"],
    keywords: ["保育", "修繕", "法定古蹟", "文化遺產", "文物", "保護", "傳承", "活化"],
  },
  {
    key: "chinese_culture",
    name: "中華文化素養",
    description: "認識中華文化傳統、建築特色與道德價值。",
    category: "humanities",
    objectiveCodes: ["4.3.1-1", "4.3.2-1"],
    objectivePrefixes: ["4.3.1", "4.3.2"],
    keywords: ["中華", "傳統", "美德", "祠堂", "宗族", "祭祀", "民俗", "文化特色"],
  },
  {
    key: "history_inquiry",
    name: "歷史探究",
    description: "能從古蹟、建築與文物中追問歷史背景與社會變遷。",
    category: "humanities",
    objectivePrefixes: ["4.4.", "4.5."],
    keywords: ["清朝", "康熙", "乾隆", "清代", "年代", "歷史", "開埠", "圍村", "昔日", "古代"],
  },
  {
    key: "architecture_appreciation",
    name: "建築欣賞",
    description: "欣賞傳統建築的結構、材料與設計特色。",
    category: "humanities",
    objectiveCodes: ["4.3.2-1", "4.3.2-2"],
    keywords: ["建築", "圍牆", "圍門", "門樓", "青磚", "花崗石", "紅砂石", "結構", "設計", "祠堂"],
  },
  {
    key: "religion_folklore",
    name: "宗教與民俗理解",
    description: "理解廟宇、神壇與祭祀活動在社區生活中的意義。",
    category: "humanities",
    objectiveCodes: ["4.3.1-1"],
    keywords: ["天后", "廟", "神", "祭祀", "香火", "供奉", "土地神", "古鐘", "酬神", "民間信仰"],
  },
  {
    key: "spatial_awareness",
    name: "地理空間認知",
    description: "理解地點位置、社區布局與環境的關係。",
    category: "humanities",
    objectivePrefixes: ["4.1."],
    objectiveCodes: ["4.5.1-3"],
    keywords: ["地圖", "位置", "方位", "東向", "北向", "布局", "村落", "地理", "山坡", "水井"],
  },
  {
    key: "scientific_inquiry",
    name: "科學探究",
    description: "運用觀察與提問，像科學家一樣探索周遭現象。",
    category: "science",
    objectivePrefixes: ["4.SA."],
    keywords: ["為什麼", "如何", "測試", "比較", "發現", "現象", "科學", "探究"],
    libraryOnly: true,
  },
  {
    key: "ecological_observation",
    name: "生態觀察",
    description: "觀察動植物與環境的相互關係。",
    category: "science",
    objectivePrefixes: ["4.LD.", "4.LE."],
    keywords: ["植物", "動物", "生態", "環境", "鳥", "濕地", "觀鳥", "物種"],
  },
  {
    key: "data_organization",
    name: "資料整理",
    description: "能把所見所聞整理成有條理的紀錄。",
    category: "core",
    objectivePrefixes: ["4.8.3"],
    keywords: ["整理", "歸納", "紀錄", "列表", "分類", "排序"],
    libraryOnly: true,
  },
  {
    key: "critical_thinking",
    name: "批判思考",
    description: "能提出疑問，比較不同觀點並作出判斷。",
    category: "core",
    objectiveCodes: ["4.SA.3-1", "4.8.2-1"],
    keywords: ["為什麼", "是否", "比較", "不同", "看法", "判斷", "理由"],
    libraryOnly: true,
  },
  {
    key: "teamwork",
    name: "團隊合作",
    description: "與同學分工協作，共同完成學習任務。",
    category: "soft",
    libraryOnly: true,
  },
  {
    key: "time_management",
    name: "時間管理",
    description: "能規劃活動步驟，按時完成紀錄與反思。",
    category: "soft",
    libraryOnly: true,
  },
  {
    key: "self_management",
    name: "自我管理",
    description: "在戶外學習中保持專注、守規律與負責任。",
    category: "soft",
    libraryOnly: true,
  },
  {
    key: "empathy",
    name: "同理關懷",
    description: "能設身處地理解他人與社區的需要。",
    category: "soft",
    objectivePrefixes: ["4.7."],
    keywords: ["關懷", "社區", "他人", "幫助", "尊重"],
    libraryOnly: true,
  },
  {
    key: "media_literacy",
    name: "資訊素養",
    description: "能分辨與整理資訊，善用工具輔助學習。",
    category: "core",
    objectivePrefixes: ["4.8."],
    keywords: ["資訊", "網上", "搜尋", "來源", "媒體"],
    libraryOnly: true,
  },
  {
    key: "civic_awareness",
    name: "公民素養",
    description: "認識社區規範、公共空間與公民責任。",
    category: "humanities",
    objectivePrefixes: ["4.6."],
    keywords: ["社區", "規則", "責任", "公共", "公民"],
    libraryOnly: true,
  },
];

const CHECKPOINT_SKILL_PROFILES = {
  checkpoint1: {
    label: "崇謙堂",
    skills: {
      culture: {
        keywords: ["教堂", "基督教", "傳教", "禮拜", "巴色會", "教會", "西式"],
        objectiveCodes: ["4.3.2-1", "4.5.1-1"],
      },
      chinese_culture: {
        keywords: ["教堂", "村落", "社區", "傳統"],
        objectiveCodes: ["4.3.2-1"],
      },
      religion_folklore: {
        keywords: ["教堂", "禮拜", "傳教", "基督教"],
        objectiveCodes: ["4.3.1-1"],
      },
      architecture_appreciation: {
        keywords: ["教堂", "建築", "擴建", "結構"],
        objectiveCodes: ["4.3.2-1"],
      },
      history_inquiry: {
        keywords: ["1926", "1927", "1951", "歷史", "擴建"],
        objectiveCodes: ["4.5.1-1"],
      },
    },
  },
  checkpoint2: {
    label: "麻笏圍",
    skills: {
      culture: {
        keywords: ["圍村", "圍牆", "圍門", "乾隆", "麻笏"],
        objectiveCodes: ["4.3.2-1", "4.5.1-2"],
      },
      heritage_conservation: {
        keywords: ["法定古蹟", "保育", "圍牆", "更樓", "紅砂石"],
        objectiveCodes: ["4.3.3-1"],
      },
      architecture_appreciation: {
        keywords: ["門樓", "花崗石", "青磚", "圍門", "更樓"],
        objectiveCodes: ["4.3.2-1"],
      },
      history_inquiry: {
        keywords: ["乾隆", "1736", "1795", "鄧氏", "古代"],
        objectiveCodes: ["4.5.1-2", "4.5.1-1"],
      },
      spatial_awareness: {
        keywords: ["布局", "圍村", "門樓", "四角"],
        objectiveCodes: ["4.5.1-3"],
      },
    },
  },
  checkpoint3: {
    label: "土地神壇",
    skills: {
      religion_folklore: {
        keywords: ["土地神", "神壇", "祭祀", "民俗"],
        objectiveCodes: ["4.3.1-1"],
      },
      chinese_culture: {
        keywords: ["土地神", "民俗", "傳統"],
        objectiveCodes: ["4.3.1-1", "4.3.2-1"],
      },
      culture: {
        keywords: ["土地神", "神壇", "社區"],
        objectiveCodes: ["4.3.2-1"],
      },
    },
  },
  checkpoint4: {
    label: "老圍",
    skills: {
      culture: {
        keywords: ["圍村", "圍牆", "圍門", "老圍"],
        objectiveCodes: ["4.5.1-1", "4.3.3-1"],
      },
      heritage_conservation: {
        keywords: ["修繕", "法定古蹟", "圍牆", "保育", "賽馬會"],
        objectiveCodes: ["4.3.3-1", "4.5.1-6"],
      },
      architecture_appreciation: {
        keywords: ["圍牆", "圍門", "瞭望", "水井", "布局"],
        objectiveCodes: ["4.3.2-1"],
      },
      history_inquiry: {
        keywords: ["圍村", "風水", "最早", "創建"],
        objectiveCodes: ["4.5.1-1"],
      },
      spatial_awareness: {
        keywords: ["風水", "東向", "北向", "小丘", "布局"],
        objectiveCodes: ["4.5.1-3", "4.1.1-1"],
      },
    },
  },
  checkpoint5: {
    label: "龍躍頭天后宮",
    skills: {
      religion_folklore: {
        keywords: ["天后", "廟", "祭祀", "香火", "供奉", "土地神", "古鐘"],
        objectiveCodes: ["4.3.1-1", "4.3.2-2"],
      },
      chinese_culture: {
        keywords: ["天后", "侍神", "千里眼", "順風耳", "傳統"],
        objectiveCodes: ["4.3.1-1", "4.3.2-1"],
      },
      culture: {
        keywords: ["天后", "廟", "康熙", "祭祀"],
        objectiveCodes: ["4.5.1-2", "4.3.2-1"],
      },
      history_inquiry: {
        keywords: ["康熙", "1695", "1700", "清代", "應試"],
        objectiveCodes: ["4.5.1-2"],
      },
      architecture_appreciation: {
        keywords: ["兩進", "正殿", "建築"],
        objectiveCodes: ["4.3.2-1"],
      },
      observation: {
        keywords: ["視覺", "嗅覺", "聽覺", "味覺", "觸覺", "看到", "聞到", "聽到"],
        senseMarkers: true,
      },
    },
  },
  checkpoint6: {
    label: "松嶺鄧公祠",
    skills: {
      chinese_culture: {
        keywords: ["祠堂", "宗祠", "鄧氏", "開基祖", "族中"],
        objectiveCodes: ["4.3.1-1", "4.3.2-1"],
      },
      religion_folklore: {
        keywords: ["祠堂", "祭祀", "祖先", "開基祖"],
        objectiveCodes: ["4.3.1-1"],
      },
      culture: {
        keywords: ["祠堂", "鄧氏", "龍躍頭"],
        objectiveCodes: ["4.5.1-1"],
      },
      history_inquiry: {
        keywords: ["16世紀", "開基", "鄧氏", "歷史"],
        objectiveCodes: ["4.5.1-1", "4.4.1-1"],
      },
      architecture_appreciation: {
        keywords: ["祠堂", "建築", "松嶺"],
        objectiveCodes: ["4.3.2-1"],
      },
    },
  },
};

const SENSE_MARKERS = ["[視覺]", "[聽覺]", "[嗅覺]", "[味覺]", "[觸覺]", "五官感受"];

const SKILL_NAME_TO_KEY = Object.fromEntries(SKILL_CATALOG.map((s) => [s.name, s.key]));

function getSkillByKey(key) {
  return SKILL_CATALOG.find((skill) => skill.key === key) || null;
}

function getSkillByName(name) {
  const key = SKILL_NAME_TO_KEY[name];
  return key ? getSkillByKey(key) : null;
}

function getInferrableSkills() {
  return SKILL_CATALOG.filter((skill) => !skill.libraryOnly);
}

function getLibrarySkills() {
  return SKILL_CATALOG;
}

function getDefaultSkillsForSeed() {
  return SKILL_CATALOG.map((skill) => ({
    name: skill.name,
    description: skill.description,
  }));
}

function objectiveMatchesSkillDefinition(objectiveCode, skill) {
  const code = String(objectiveCode || "");
  if (skill.objectiveCodes?.includes(code)) return true;
  if (skill.objectivePrefixes?.some((prefix) => code.startsWith(prefix))) return true;
  return false;
}

function getObjectiveSkillLinks(objectiveCode) {
  return SKILL_CATALOG.filter(
    (skill) => !skill.libraryOnly && objectiveMatchesSkillDefinition(objectiveCode, skill)
  ).map((skill) => skill.name);
}

module.exports = {
  SKILL_CATALOG,
  CHECKPOINT_SKILL_PROFILES,
  SENSE_MARKERS,
  SKILL_NAME_TO_KEY,
  getSkillByKey,
  getSkillByName,
  getInferrableSkills,
  getLibrarySkills,
  getDefaultSkillsForSeed,
  objectiveMatchesSkillDefinition,
  getObjectiveSkillLinks,
};
