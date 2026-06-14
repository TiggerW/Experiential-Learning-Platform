const { runReadQuery } = require("./neo4j");
const { pool } = require("./db");

const INTENT_PATTERNS = {
  locations: /地點|位置|參觀|visit|location|地圖|map|文物徑|checkpoint|去哪|到過/iu,
  objectives: /學習重點|learning objective|objective|\blo\b|目標|課程|curriculum|人文|科學/iu,
  skills: /技能|skill|能力|觀察|文化|反思|溝通|develops/iu,
  feedback: /回饋|反馈|feedback|評語|comment/iu,
  reflection: /反思|reflection|post trip|旅程後|感想/iu,
  progress: /進度|progress|完成|未完成|summary|總結|概覽|overview|活動/iu,
  compare: /比較|compare|誰|which student|哪位|差異/iu,
};

function detectIntents(question) {
  const text = String(question || "").trim();
  const intents = new Set(["overview"]);
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(text)) intents.add(intent);
  }
  if (intents.size === 1) {
    intents.add("locations");
    intents.add("objectives");
  }
  return intents;
}

function toPlainValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toPlainValue).filter(Boolean).join("、");
  }
  if (typeof value === "object") {
    if (value.properties) {
      return Object.values(value.properties).map(toPlainValue).filter(Boolean).join(" ");
    }
    if (typeof value.toNumber === "function") return String(value.toNumber());
    if (typeof value.toString === "function" && value.toString() !== "[object Object]") {
      return value.toString();
    }
  }
  return "";
}

function rowsFromResult(result) {
  return result.records.map((record) => {
    const row = {};
    for (const key of record.keys) {
      row[key] = toPlainValue(record.get(key));
    }
    return row;
  });
}

function dedupeRows(rows, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function formatSection(title, rows, formatter) {
  if (!rows.length) return "";
  const lines = rows.map(formatter).filter(Boolean);
  if (!lines.length) return "";
  return `${title}\n${lines.join("\n")}`;
}

async function getTeacherStudentIds(teacherId) {
  const [rows] = await pool.query(
    "SELECT id, name FROM members WHERE role = 'student' AND advisor_teacher_id = ? ORDER BY name ASC",
    [teacherId]
  );
  return rows.map((row) => ({ id: String(row.id), name: row.name }));
}

async function getCurrentCardIdsForStudent(studentId) {
  const [rows] = await pool.query(
    `
    SELECT c.id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE bc.student_id = ?
    `,
    [studentId]
  );
  return rows.map((row) => String(row.id));
}

async function getCurrentCardIdsForTeacher(teacherId) {
  const [rows] = await pool.query(
    `
    SELECT c.id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    JOIN members m ON m.id = bc.student_id
    WHERE m.advisor_teacher_id = ?
    `,
    [teacherId]
  );
  return rows.map((row) => String(row.id));
}

async function queryStudentOverview(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[:PARTICIPATED_IN]->(a:Activity)
    WHERE a.mysqlId IN $cardIds
    OPTIONAL MATCH (a)-[:AT_STAGE]->(w:WorkflowStage)
    OPTIONAL MATCH (a)-[:LOCATED_AT]->(l:Location)
    OPTIONAL MATCH (a)-[:ACHIEVES]->(lo:LearningObjective)
    WITH s, a,
         max(w.title) AS stage,
         min(coalesce(w.sortOrder, 99)) AS stageOrder,
         max(l.nameChi) AS locationName,
         count(DISTINCT lo) AS objectiveCount
    RETURN s.name AS studentName,
           coalesce(stage, 'Unknown') AS stage,
           stageOrder,
           a.mysqlId AS activityId,
           a.title AS activityTitle,
           a.recordType AS recordType,
           locationName,
           objectiveCount
    ORDER BY stageOrder, activityTitle
    LIMIT 30
    `,
    { studentId: String(studentId), cardIds }
  );
  return dedupeRows(rowsFromResult(result), (row) => row.activityId || `${row.activityTitle}:${row.stage}`);
}

async function queryStudentLocations(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[:VISITED]->(l:Location)
    OPTIONAL MATCH (l)-[:PART_OF]->(tr:Trip)
    OPTIONAL MATCH (s)-[:PARTICIPATED_IN]->(a:Activity)-[:LOCATED_AT]->(l)
    WHERE a.mysqlId IN $cardIds
    RETURN l.nameChi AS locationName,
           l.nameEng AS locationNameEng,
           tr.title AS tripName,
           collect(DISTINCT a.title) AS activities
    ORDER BY l.nameChi
    `,
    { studentId: String(studentId), cardIds }
  );
  return rowsFromResult(result);
}

async function queryStudentObjectives(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[:PARTICIPATED_IN]->(a:Activity)-[:ACHIEVES]->(lo:LearningObjective)
    WHERE a.mysqlId IN $cardIds
    RETURN DISTINCT a.mysqlId AS activityId,
           a.title AS activityTitle,
           lo.objectiveCode AS objectiveCode,
           lo.content AS objectiveContent,
           lo.category AS category
    ORDER BY activityTitle, objectiveCode
    LIMIT 40
    `,
    { studentId: String(studentId), cardIds }
  );
  return dedupeRows(
    rowsFromResult(result),
    (row) => `${row.activityId || row.activityTitle}:${row.objectiveCode}`
  );
}

async function queryStudentSkills(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[d:DEVELOPS]->(sk:Skill)
    WHERE coalesce(d.status, 'confirmed') = 'confirmed'
      AND (d.evidenceActivityId IS NULL OR d.evidenceActivityId IN $cardIds)
    OPTIONAL MATCH (evidenceActivity:Activity {mysqlId: d.evidenceActivityId})
    WHERE evidenceActivity IS NULL OR evidenceActivity.mysqlId IN $cardIds
    RETURN sk.name AS skillName,
           d.level AS level,
           d.source AS source,
           d.evidence AS evidence,
           evidenceActivity.title AS evidenceActivity
    ORDER BY sk.name
    `,
    { studentId: String(studentId), cardIds }
  );
  return rowsFromResult(result);
}

async function queryStudentFeedback(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[:PARTICIPATED_IN]->(a:Activity)<-[f:GAVE_FEEDBACK]-(t:Teacher)
    WHERE a.mysqlId IN $cardIds
    RETURN a.title AS activityTitle,
           t.name AS teacherName,
           f.text AS feedback
    ORDER BY a.title
    LIMIT 20
    `,
    { studentId: String(studentId), cardIds }
  );
  return rowsFromResult(result);
}

async function queryStudentReflection(studentId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[:PARTICIPATED_IN]->(a:Activity)-[:AT_STAGE]->(w:WorkflowStage)
    WHERE a.mysqlId IN $cardIds
      AND (w.stageKey = 'post_trip' OR toLower(w.title) CONTAINS 'reflection')
    OPTIONAL MATCH (a)-[:ACHIEVES]->(lo:LearningObjective)
    WITH a, collect(DISTINCT lo.objectiveCode) AS objectives
    RETURN a.title AS activityTitle,
           a.description AS description,
           objectives
    ORDER BY activityTitle
    LIMIT 15
    `,
    { studentId: String(studentId), cardIds }
  );
  return rowsFromResult(result);
}

async function queryTeacherOverview(teacherId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (t:Teacher {mysqlId: $teacherId})-[:ADVISES]->(s:Student)
    OPTIONAL MATCH (s)-[:PARTICIPATED_IN]->(a:Activity)
    WHERE a IS NULL OR a.mysqlId IN $cardIds
    OPTIONAL MATCH (a)-[:AT_STAGE]->(w:WorkflowStage)
    OPTIONAL MATCH (a)-[:LOCATED_AT]->(l:Location)
    RETURN s.name AS studentName,
           s.className AS className,
           coalesce(w.title, 'Unknown') AS stage,
           coalesce(w.sortOrder, 99) AS stageOrder,
           a.mysqlId AS activityId,
           a.title AS activityTitle,
           l.nameChi AS locationName
    ORDER BY studentName, stageOrder, activityTitle
    LIMIT 60
    `,
    { teacherId: String(teacherId), cardIds }
  );
  return dedupeRows(
    rowsFromResult(result),
    (row) => `${row.studentName}:${row.activityId || row.activityTitle || row.stage}`
  );
}

async function queryTeacherSkills(teacherId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (t:Teacher {mysqlId: $teacherId})-[:ADVISES]->(s:Student)-[d:DEVELOPS]->(sk:Skill)
    WHERE coalesce(d.status, 'confirmed') = 'confirmed'
      AND (d.evidenceActivityId IS NULL OR d.evidenceActivityId IN $cardIds)
    RETURN s.name AS studentName,
           sk.name AS skillName,
           d.level AS level,
           d.source AS source
    ORDER BY s.name, sk.name
    `,
    { teacherId: String(teacherId), cardIds }
  );
  return rowsFromResult(result);
}

async function queryTeacherObjectives(teacherId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (t:Teacher {mysqlId: $teacherId})-[:ADVISES]->(s:Student)-[:PARTICIPATED_IN]->(a:Activity)-[:ACHIEVES]->(lo:LearningObjective)
    WHERE a.mysqlId IN $cardIds
    RETURN DISTINCT s.name AS studentName,
           a.mysqlId AS activityId,
           a.title AS activityTitle,
           lo.objectiveCode AS objectiveCode,
           lo.category AS category
    ORDER BY studentName, activityTitle, objectiveCode
    LIMIT 50
    `,
    { teacherId: String(teacherId), cardIds }
  );
  return dedupeRows(
    rowsFromResult(result),
    (row) => `${row.studentName}:${row.activityId || row.activityTitle}:${row.objectiveCode}`
  );
}

async function queryTeacherLocations(teacherId, cardIds) {
  if (!cardIds.length) return [];
  const result = await runReadQuery(
    `
    MATCH (t:Teacher {mysqlId: $teacherId})-[:ADVISES]->(s:Student)-[:VISITED]->(l:Location)
    WHERE EXISTS {
      MATCH (s)-[:PARTICIPATED_IN]->(a:Activity)-[:LOCATED_AT]->(l)
      WHERE a.mysqlId IN $cardIds
    }
    RETURN s.name AS studentName,
           l.nameChi AS locationName,
           l.nameEng AS locationNameEng
    ORDER BY s.name, l.nameChi
    `,
    { teacherId: String(teacherId), cardIds }
  );
  return dedupeRows(
    rowsFromResult(result),
    (row) => `${row.studentName}:${row.locationName || row.locationNameEng}`
  );
}

function buildStudentGraphSections(studentId, cardIds, intents) {
  const tasks = [];
  if (intents.has("overview") || intents.has("progress")) {
    tasks.push(
      queryStudentOverview(studentId, cardIds).then((rows) =>
        formatSection(
          "活動與階段概覽",
          rows,
          (row) =>
            `- [${row.stage || "Stage"}] ${row.activityTitle}${row.locationName ? ` @ ${row.locationName}` : ""}${row.objectiveCount ? `（${row.objectiveCount} 個學習重點）` : ""}`
        )
      )
    );
  }
  if (intents.has("locations")) {
    tasks.push(
      queryStudentLocations(studentId, cardIds).then((rows) =>
        formatSection(
          "參觀地點與路線",
          rows,
          (row) =>
            `- ${row.locationName || row.locationNameEng}${row.tripName ? `（${row.tripName}）` : ""}${row.activities ? `：活動 ${row.activities}` : ""}`
        )
      )
    );
  }
  if (intents.has("objectives")) {
    tasks.push(
      queryStudentObjectives(studentId, cardIds).then((rows) =>
        formatSection(
          "活動連結的學習重點",
          rows,
          (row) =>
            `- ${row.activityTitle} → ${row.objectiveCode} [${row.category}] ${row.objectiveContent}`
        )
      )
    );
  }
  if (intents.has("skills")) {
    tasks.push(
      queryStudentSkills(studentId, cardIds).then((rows) =>
        formatSection(
          "已確認技能發展",
          rows,
          (row) =>
            `- ${row.skillName}（${row.level}，${row.source || "manual"}）${row.evidenceActivity ? `，證據活動：${row.evidenceActivity}` : ""}`
        )
      )
    );
  }
  if (intents.has("feedback")) {
    tasks.push(
      queryStudentFeedback(studentId, cardIds).then((rows) =>
        formatSection(
          "老師回饋",
          rows,
          (row) => `- ${row.activityTitle}（${row.teacherName}）：${row.feedback}`
        )
      )
    );
  }
  if (intents.has("reflection") || intents.has("progress")) {
    tasks.push(
      queryStudentReflection(studentId, cardIds).then((rows) =>
        formatSection(
          "Post Trip 反思活動",
          rows,
          (row) =>
            `- ${row.activityTitle}${row.objectives ? `（LO: ${row.objectives}）` : ""}`
        )
      )
    );
  }
  return tasks;
}

function buildTeacherGraphSections(teacherId, cardIds, intents) {
  const tasks = [];
  if (intents.has("overview") || intents.has("progress") || intents.has("compare")) {
    tasks.push(
      queryTeacherOverview(teacherId, cardIds).then((rows) =>
        formatSection(
          "學生活動概覽",
          rows,
          (row) =>
            `- ${row.studentName}${row.className ? ` (${row.className})` : ""} | [${row.stage || "Stage"}] ${row.activityTitle || "（暫無活動）"}${row.locationName ? ` @ ${row.locationName}` : ""}`
        )
      )
    );
  }
  if (intents.has("locations") || intents.has("compare")) {
    tasks.push(
      queryTeacherLocations(teacherId, cardIds).then((rows) =>
        formatSection(
          "學生參觀地點",
          rows,
          (row) => `- ${row.studentName}：${row.locationName || row.locationNameEng}`
        )
      )
    );
  }
  if (intents.has("objectives") || intents.has("compare")) {
    tasks.push(
      queryTeacherObjectives(teacherId, cardIds).then((rows) =>
        formatSection(
          "學習重點連結",
          rows,
          (row) =>
            `- ${row.studentName} | ${row.activityTitle} → ${row.objectiveCode} [${row.category}]`
        )
      )
    );
  }
  if (intents.has("skills") || intents.has("compare")) {
    tasks.push(
      queryTeacherSkills(teacherId, cardIds).then((rows) =>
        formatSection(
          "技能發展（已確認）",
          rows,
          (row) => `- ${row.studentName}：${row.skillName}（${row.level}）`
        )
      )
    );
  }
  return tasks;
}

async function buildGraphRagContext({ userId, role, question }) {
  const intents = detectIntents(question);
  const sections = [];

  try {
    if (role === "student") {
      const cardIds = await getCurrentCardIdsForStudent(userId);
      const tasks = buildStudentGraphSections(String(userId), cardIds, intents);
      const results = await Promise.all(tasks);
      sections.push(...results.filter(Boolean));
    } else if (role === "teacher") {
      const students = await getTeacherStudentIds(userId);
      if (!students.length) {
        return "Graph RAG: 此教師暫無指派學生。";
      }
      const cardIds = await getCurrentCardIdsForTeacher(userId);
      sections.push(`指派學生：${students.map((s) => s.name).join("、")}`);
      const tasks = buildTeacherGraphSections(String(userId), cardIds, intents);
      const results = await Promise.all(tasks);
      sections.push(...results.filter(Boolean));
    } else {
      return "";
    }
  } catch (error) {
    console.error("Graph RAG query failed:", error);
    return "";
  }

  if (!sections.length) {
    return "Graph RAG: 圖譜中暫無與此問題相關的學習資料。";
  }

  return [
    "以下資料來自 Neo4j 學習知識圖譜（Graph RAG），請優先根據這些節點與關係回答：",
    ...sections,
  ].join("\n\n");
}

async function buildStudentGraphRagContext(studentId, question) {
  const cardIds = await getCurrentCardIdsForStudent(studentId);
  const intents = detectIntents(question);
  intents.add("locations");
  intents.add("objectives");
  intents.add("skills");
  intents.add("reflection");

  const tasks = buildStudentGraphSections(String(studentId), cardIds, intents);
  const results = await Promise.all(tasks);
  const sections = results.filter(Boolean);

  if (!sections.length) {
    return "Graph RAG: 圖譜中暫無此學生的學習資料。";
  }

  return [
    "以下資料來自 Neo4j 學習知識圖譜（Graph RAG），請優先根據這些節點與關係生成內容：",
    ...sections,
  ].join("\n\n");
}

module.exports = {
  buildGraphRagContext,
  buildStudentGraphRagContext,
  detectIntents,
};
