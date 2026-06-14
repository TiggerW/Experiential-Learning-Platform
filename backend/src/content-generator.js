const { pool } = require("./db");
const { buildStudentGraphRagContext } = require("./graph-rag");
const { autoLinkCardObjectives } = require("./objective-matching");

const GENERATION_TYPES = new Set(["reflection", "followup", "assessment"]);

function generationQuestion(type, cardTitle) {
  const location = cardTitle || "活動地點";
  if (type === "reflection") {
    return `${location} 學生反思、post trip reflection、學習重點、技能、地點`;
  }
  if (type === "followup") {
    return `${location} 延伸活動、學習重點、技能、參觀地點`;
  }
  return `${location} 小測驗、評估題、學習重點、技能、課程目標`;
}

function typePromptConfig(type, options) {
  const count = Number(options.count) || 5;
  const difficulty = options.difficulty === "advanced" ? "進階" : options.difficulty === "basic" ? "基礎" : "小四程度";

  if (type === "reflection") {
    return {
      instruction: `請根據學生活動與圖譜資料，生成 ${count} 條 Post Trip 反思引導問題。難度：${difficulty}。每題應引導學生連結實地參觀、感官觀察與學習重點。`,
      itemShape: '{ "title": "題目簡稱", "content": "完整反思問題", "kind": "reflection_question" }',
    };
  }
  if (type === "followup") {
    return {
      instruction: `請根據學生已參觀的地點與圖譜資料，生成 ${count} 個延伸學習活動建議。難度：${difficulty}。每個活動應可在課堂或校外延伸完成。`,
      itemShape: '{ "title": "活動名稱", "content": "活動說明與步驟", "kind": "followup_activity" }',
    };
  }
  return {
    instruction: `請根據學生活動、學習重點與圖譜資料，生成 ${count} 道評估題。難度：${difficulty}。包含選擇題與短答題，並附簡短答案要點。`,
    itemShape:
      '{ "title": "題號或簡稱", "content": "題目全文", "kind": "mcq" 或 "short_answer", "options": ["A...", "B..."], "answerHint": "答案要點" }',
  };
}

async function assertTeacherCanAccessStudent(teacherId, studentId, role = "teacher") {
  if (role === "admin") return true;
  const [rows] = await pool.query(
    "SELECT id FROM members WHERE id = ? AND role = 'student' AND advisor_teacher_id = ? LIMIT 1",
    [studentId, teacherId]
  );
  return rows.length > 0;
}

async function loadCardContext(studentId, cardId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.location,
      c.checkpoint_id,
      c.lat,
      c.lng,
      c.record_type,
      bc.id AS column_id,
      bc.title AS column_title,
      bc.stage_key,
      m.name AS student_name,
      m.class_name
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    JOIN members m ON m.id = bc.student_id
    WHERE c.id = ? AND bc.student_id = ?
    LIMIT 1
    `,
    [cardId, studentId]
  );
  const card = rows[0];
  if (!card) return null;

  const [objectives] = await pool.query(
    `
    SELECT lo.id, lo.objective_code, lo.content, lo.category, lo.topic, lo.lesson
    FROM card_learning_objectives clo
    JOIN learning_objectives lo ON lo.id = clo.objective_id
    WHERE clo.card_id = ?
    ORDER BY lo.objective_code ASC
    `,
    [cardId]
  );

  const [skills] = await pool.query(
    `
    SELECT sk.name, ss.level, ss.status, ss.source, ss.evidence
    FROM student_skills ss
    JOIN skills sk ON sk.id = ss.skill_id
    WHERE ss.student_id = ? AND ss.card_id = ? AND ss.status = 'confirmed'
    ORDER BY sk.name ASC
    `,
    [studentId, cardId]
  );

  return {
    card: {
      id: String(card.id),
      title: card.title,
      description: card.description || "",
      location: card.location || "",
      checkpointId: card.checkpoint_id || "",
      recordType: card.record_type || "general",
      columnId: String(card.column_id),
      columnTitle: card.column_title,
      stageKey: card.stage_key || "",
    },
    student: {
      name: card.student_name,
      className: card.class_name || "",
    },
    objectives: objectives.map((row) => ({
      id: String(row.id),
      objectiveCode: row.objective_code,
      content: row.content,
      category: row.category,
      topic: row.topic,
      lesson: row.lesson,
    })),
    skills: skills.map((row) => ({
      name: row.name,
      level: row.level,
      evidence: row.evidence || "",
    })),
  };
}

function buildCardContextText(context) {
  const lines = [
    `學生：${context.student.name}${context.student.className ? `（${context.student.className}）` : ""}`,
    `活動卡：${context.card.title}`,
    `欄位：${context.card.columnTitle}（${context.card.stageKey || "custom"}）`,
    `地點：${context.card.location || context.card.title}`,
    `紀錄類型：${context.card.recordType}`,
  ];
  if (context.card.description) {
    lines.push(`現有描述：${context.card.description}`);
  }
  if (context.objectives.length) {
    lines.push(
      `已連結學習重點：${context.objectives.map((item) => `${item.objectiveCode} ${item.content}`).join("；")}`
    );
  }
  if (context.skills.length) {
    lines.push(
      `已確認技能：${context.skills.map((item) => `${item.name}（${item.level}）`).join("；")}`
    );
  }
  return lines.join("\n");
}

function extractJsonPayload(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI response did not contain JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeGeneratedItems(payload, type) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item, index) => {
      const title = String(item?.title || "").trim() || `${type} item ${index + 1}`;
      const content = String(item?.content || "").trim();
      if (!content) return null;
      const kind = String(item?.kind || "").trim() || type;
      const options = Array.isArray(item?.options)
        ? item.options.map((option) => String(option || "").trim()).filter(Boolean)
        : [];
      const answerHint = String(item?.answerHint || "").trim();
      return {
        id: `gen-${index + 1}`,
        title,
        content,
        kind,
        options,
        answerHint,
        selected: true,
      };
    })
    .filter(Boolean);
}

async function callDeepSeekJson({ apiKey, baseUrl, model, systemPrompt, userPrompt }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return extractJsonPayload(content);
}

async function generateLearningContent({
  teacherId,
  studentId,
  cardId,
  type,
  options = {},
  deepseekApiKey,
  deepseekBaseUrl,
  deepseekModel,
}) {
  if (!GENERATION_TYPES.has(type)) {
    throw new Error("Invalid generation type");
  }
  if (!(await assertTeacherCanAccessStudent(teacherId, studentId, options.userRole))) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const context = await loadCardContext(studentId, cardId);
  if (!context) {
    const error = new Error("Card not found");
    error.statusCode = 404;
    throw error;
  }

  const graphContext = await buildStudentGraphRagContext(
    studentId,
    generationQuestion(type, context.card.title)
  );
  const promptConfig = typePromptConfig(type, options);

  const systemPrompt =
    "你是香港小學體驗學習內容設計助手。你只能根據提供的學生活動資料、學習重點、技能與 Neo4j Graph RAG 圖譜資料生成內容。輸出必須是有效 JSON，格式為 {\"summary\":\"...\",\"items\":[...]}，不要輸出 markdown。";

  const userPrompt = [
    promptConfig.instruction,
    "",
    "活動與課程脈絡：",
    buildCardContextText(context),
    "",
    graphContext,
    "",
    `每個 item 格式示例：${promptConfig.itemShape}`,
    "請只回傳 JSON。",
  ].join("\n");

  const payload = await callDeepSeekJson({
    apiKey: deepseekApiKey,
    baseUrl: deepseekBaseUrl,
    model: deepseekModel,
    systemPrompt,
    userPrompt,
  });

  const items = normalizeGeneratedItems(payload, type);
  if (!items.length) {
    throw new Error("AI did not return usable items");
  }

  return {
    type,
    summary: String(payload.summary || "").trim(),
    items,
    context: {
      studentId: String(studentId),
      cardId: String(cardId),
      cardTitle: context.card.title,
      stageKey: context.card.stageKey,
      objectiveCount: context.objectives.length,
      skillCount: context.skills.length,
    },
  };
}

function formatItemsAsDescription(type, items) {
  const blocks = items.map((item, index) => {
    const lines = [`${index + 1}. ${item.title}`, item.content];
    if (item.options?.length) {
      lines.push(item.options.map((option, optionIndex) => `   ${String.fromCharCode(65 + optionIndex)}. ${option}`).join("\n"));
    }
    if (item.answerHint) {
      lines.push(`答案要點：${item.answerHint}`);
    }
    return lines.join("\n");
  });

  const heading =
    type === "reflection"
      ? "【AI 反思引導題】"
      : type === "followup"
        ? "【AI 延伸活動】"
        : "【AI 小測驗】";

  return `${heading}\n\n${blocks.join("\n\n")}`;
}

async function findTargetColumnId(studentId, stageKey) {
  const [rows] = await pool.query(
    `
    SELECT id
    FROM board_columns
    WHERE student_id = ? AND stage_key = ?
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
    `,
    [studentId, stageKey]
  );
  return rows[0]?.id || null;
}

async function applyGeneratedContent({
  teacherId,
  studentId,
  cardId,
  type,
  items,
  applyMode,
  userRole = "teacher",
}) {
  if (!GENERATION_TYPES.has(type)) {
    throw new Error("Invalid generation type");
  }
  if (!(await assertTeacherCanAccessStudent(teacherId, studentId, userRole))) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item?.selected !== false);
  if (!selectedItems.length) {
    throw new Error("No items selected");
  }

  const context = await loadCardContext(studentId, cardId);
  if (!context) {
    const error = new Error("Card not found");
    error.statusCode = 404;
    throw error;
  }

  const formatted = formatItemsAsDescription(type, selectedItems);

  if (type === "reflection" && applyMode !== "create_card") {
    const nextDescription = [context.card.description, formatted].filter(Boolean).join("\n\n");
    await pool.query("UPDATE board_cards SET description = ? WHERE id = ?", [nextDescription, cardId]);
    const { syncCardGraph } = require("./graph-sync");
    await syncCardGraph(cardId);
    return {
      action: "append_to_card",
      cardId: String(cardId),
      message: `已將 ${selectedItems.length} 條反思題加入「${context.card.title}」。`,
    };
  }

  const stageKey =
    type === "assessment"
      ? context.card.stageKey === "post_trip"
        ? "post_trip"
        : "pretrip"
      : "pretrip";

  const columnId = await findTargetColumnId(studentId, stageKey);
  if (!columnId) {
    throw new Error(`Target column not found: ${stageKey}`);
  }

  const title =
    type === "followup"
      ? `${context.card.title} 延伸活動`
      : type === "assessment"
        ? `${context.card.title} 小測驗`
        : `${context.card.title} 反思補充`;

  const [orderRows] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM board_cards WHERE column_id = ?",
    [columnId]
  );

  const recordType = type === "assessment" ? "assessment" : type === "followup" ? "general" : "five_sense";
  const [result] = await pool.query(
    `
    INSERT INTO board_cards (
      column_id, title, description, location, activity_date, sort_order,
      checkpoint_id, lat, lng, record_type, source
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'ai_generated')
    `,
    [
      columnId,
      title,
      formatted,
      context.card.location || context.card.title,
      orderRows[0].next_order,
      context.card.checkpointId || null,
      null,
      null,
      recordType,
    ]
  );

  const newCardId = result.insertId;
  const { syncCardGraph } = require("./graph-sync");
  await syncCardGraph(newCardId);
  await autoLinkCardObjectives(newCardId);
  await syncCardGraph(newCardId);
  const { inferStudentSkillsForCard } = require("./skill-inference");
  const recordIds = await inferStudentSkillsForCard(newCardId);
  const { syncStudentSkillGraph } = require("./graph-sync");
  for (const recordId of recordIds) {
    await syncStudentSkillGraph(recordId);
  }

  return {
    action: "create_card",
    cardId: String(newCardId),
    columnStageKey: stageKey,
    title,
    message: `已建立新卡「${title}」於 ${stageKey === "pretrip" ? "Pretrip" : "Post Trip Reflection"}。`,
  };
}

module.exports = {
  GENERATION_TYPES,
  generateLearningContent,
  applyGeneratedContent,
  loadCardContext,
  assertTeacherCanAccessStudent,
};
