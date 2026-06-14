const { pool } = require("./db");
const { runQuery } = require("./neo4j");
const { CHECKPOINTS, STAGE_COLUMNS } = require("./constants");

async function initGraphSchema() {
  const statements = [
    "CREATE CONSTRAINT student_mysql_id IF NOT EXISTS FOR (s:Student) REQUIRE s.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT teacher_mysql_id IF NOT EXISTS FOR (t:Teacher) REQUIRE t.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT activity_mysql_id IF NOT EXISTS FOR (a:Activity) REQUIRE a.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT location_checkpoint_id IF NOT EXISTS FOR (l:Location) REQUIRE l.checkpointId IS UNIQUE",
    "CREATE CONSTRAINT workflow_stage_mysql_id IF NOT EXISTS FOR (w:WorkflowStage) REQUIRE w.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT learning_objective_mysql_id IF NOT EXISTS FOR (lo:LearningObjective) REQUIRE lo.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT skill_mysql_id IF NOT EXISTS FOR (sk:Skill) REQUIRE sk.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT media_mysql_id IF NOT EXISTS FOR (m:Media) REQUIRE m.mysqlId IS UNIQUE",
    "CREATE CONSTRAINT trip_name IF NOT EXISTS FOR (tr:Trip) REQUIRE tr.name IS UNIQUE",
  ];

  for (const statement of statements) {
    try {
      await runQuery(statement);
    } catch (error) {
      const message = String(error?.message || error);
      if (!/already exists/i.test(message)) {
        throw error;
      }
    }
  }

  await runQuery(
    `
    MERGE (tr:Trip {name: $name})
    SET tr.title = $title, tr.region = $region
    `,
    { name: "lung_yeuk_tau", title: "龍躍頭文物徑", region: "Hong Kong" }
  );

  for (const checkpoint of CHECKPOINTS) {
    await runQuery(
      `
      MERGE (l:Location {checkpointId: $checkpointId})
      SET l.nameChi = $nameChi,
          l.nameEng = $nameEng,
          l.lat = $lat,
          l.lng = $lng
      WITH l
      MATCH (tr:Trip {name: $tripName})
      MERGE (l)-[:PART_OF]->(tr)
      `,
      {
        checkpointId: checkpoint.id,
        nameChi: checkpoint.nameChi,
        nameEng: checkpoint.nameEng,
        lat: checkpoint.lat,
        lng: checkpoint.lng,
        tripName: "lung_yeuk_tau",
      }
    );
  }
}

async function syncMemberGraph(memberId) {
  const [rows] = await pool.query(
    `
    SELECT id, name, email, role, school, class_name, advisor_teacher_id
    FROM members
    WHERE id = ?
    LIMIT 1
    `,
    [memberId]
  );
  const member = rows[0];
  if (!member) return;

  if (member.role === "student") {
    await runQuery(
      `
      MERGE (s:Student {mysqlId: $mysqlId})
      SET s.name = $name, s.email = $email, s.school = $school, s.className = $className
      `,
      {
        mysqlId: String(member.id),
        name: member.name,
        email: member.email,
        school: member.school || "",
        className: member.class_name || "",
      }
    );

    if (member.class_name) {
      await runQuery(
        `
        MATCH (s:Student {mysqlId: $studentId})
        MERGE (c:Class {name: $className})
        MERGE (s)-[:ENROLLED_IN]->(c)
        `,
        { studentId: String(member.id), className: member.class_name }
      );
    }

    if (member.advisor_teacher_id) {
      await syncMemberGraph(member.advisor_teacher_id);
      await runQuery(
        `
        MATCH (t:Teacher {mysqlId: $teacherId}), (s:Student {mysqlId: $studentId})
        MERGE (t)-[:ADVISES]->(s)
        `,
        { teacherId: String(member.advisor_teacher_id), studentId: String(member.id) }
      );
    }
  } else if (member.role === "teacher") {
    await runQuery(
      `
      MERGE (t:Teacher {mysqlId: $mysqlId})
      SET t.name = $name, t.email = $email
      `,
      { mysqlId: String(member.id), name: member.name, email: member.email }
    );
  }
}

async function syncWorkflowStage(columnId) {
  const [rows] = await pool.query(
    `
    SELECT bc.id, bc.title, bc.sort_order, bc.stage_key, bc.is_fixed_stage, bc.student_id
    FROM board_columns bc
    WHERE bc.id = ?
  `,
    [columnId]
  );
  const column = rows[0];
  if (!column) return;

  await syncMemberGraph(column.student_id);
  await runQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})
    MERGE (w:WorkflowStage {mysqlId: $mysqlId})
    SET w.title = $title,
        w.sortOrder = $sortOrder,
        w.stageKey = $stageKey,
        w.isFixedStage = $isFixedStage
    MERGE (s)-[:HAS_STAGE]->(w)
    `,
    {
      studentId: String(column.student_id),
      mysqlId: String(column.id),
      title: column.title,
      sortOrder: column.sort_order,
      stageKey: column.stage_key || "",
      isFixedStage: Boolean(column.is_fixed_stage),
    }
  );
}

async function syncCardGraph(cardId) {
  const [rows] = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.location,
      c.activity_date,
      c.feedback,
      c.checkpoint_id,
      c.lat,
      c.lng,
      c.record_type,
      c.created_at,
      bc.id AS column_id,
      bc.title AS column_title,
      bc.stage_key,
      bc.student_id,
      m.advisor_teacher_id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    JOIN members m ON m.id = bc.student_id
    WHERE c.id = ?
    `,
    [cardId]
  );
  const card = rows[0];
  if (!card) return;

  await syncMemberGraph(card.student_id);
  await syncWorkflowStage(card.column_id);

  await runQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})
    MERGE (a:Activity {mysqlId: $mysqlId})
    SET a.title = $title,
        a.description = $description,
        a.location = $location,
        a.activityDate = $activityDate,
        a.feedback = $feedback,
        a.checkpointId = $checkpointId,
        a.lat = $lat,
        a.lng = $lng,
        a.recordType = $recordType,
        a.createdAt = $createdAt
    MERGE (s)-[:PARTICIPATED_IN]->(a)
    WITH a
    MATCH (w:WorkflowStage {mysqlId: $columnId})
    MERGE (a)-[:AT_STAGE]->(w)
    `,
    {
      studentId: String(card.student_id),
      mysqlId: String(card.id),
      title: card.title,
      description: card.description || "",
      location: card.location || "",
      activityDate: card.activity_date ? String(card.activity_date).slice(0, 10) : "",
      feedback: card.feedback || "",
      checkpointId: card.checkpoint_id || "",
      lat: card.lat !== null ? Number(card.lat) : null,
      lng: card.lng !== null ? Number(card.lng) : null,
      recordType: card.record_type || "general",
      createdAt: card.created_at ? new Date(card.created_at).toISOString() : "",
      columnId: String(card.column_id),
    }
  );

  if (card.checkpoint_id) {
    await runQuery(
      `
      MATCH (a:Activity {mysqlId: $activityId}), (l:Location {checkpointId: $checkpointId})
      MERGE (a)-[:LOCATED_AT]->(l)
      WITH l
      MATCH (s:Student {mysqlId: $studentId})
      MERGE (s)-[:VISITED]->(l)
      `,
      {
        activityId: String(card.id),
        checkpointId: card.checkpoint_id,
        studentId: String(card.student_id),
      }
    );
  }

  const [images] = await pool.query(
    "SELECT id, image_url, sort_order FROM card_images WHERE card_id = ? ORDER BY sort_order ASC, id ASC",
    [cardId]
  );

  await runQuery(
    `
    MATCH (a:Activity {mysqlId: $activityId})-[rel:HAS_MEDIA]->(:Media)
    DELETE rel
    `,
    { activityId: String(cardId) }
  );

  for (const image of images) {
    await runQuery(
      `
      MATCH (a:Activity {mysqlId: $activityId})
      MERGE (m:Media {mysqlId: $mediaId})
      SET m.url = $url, m.sortOrder = $sortOrder
      MERGE (a)-[:HAS_MEDIA]->(m)
      `,
      {
        activityId: String(cardId),
        mediaId: String(image.id),
        url: image.image_url,
        sortOrder: image.sort_order,
      }
    );
  }

  const [objectives] = await pool.query(
    `
    SELECT lo.id, lo.objective_code, lo.content
    FROM card_learning_objectives clo
    JOIN learning_objectives lo ON lo.id = clo.objective_id
    WHERE clo.card_id = ?
    `,
    [cardId]
  );

  await runQuery(
    `
    MATCH (a:Activity {mysqlId: $activityId})-[rel:ACHIEVES]->(:LearningObjective)
    DELETE rel
    `,
    { activityId: String(cardId) }
  );

  for (const objective of objectives) {
    await syncLearningObjectiveGraph(objective.id);
    await runQuery(
      `
      MATCH (a:Activity {mysqlId: $activityId}), (lo:LearningObjective {mysqlId: $objectiveId})
      MERGE (a)-[:ACHIEVES]->(lo)
      `,
      { activityId: String(cardId), objectiveId: String(objective.id) }
    );
  }

  if (card.feedback && card.advisor_teacher_id) {
    await syncMemberGraph(card.advisor_teacher_id);
    await runQuery(
      `
      MATCH (t:Teacher {mysqlId: $teacherId}), (a:Activity {mysqlId: $activityId})
      MERGE (t)-[f:GAVE_FEEDBACK]->(a)
      SET f.text = $feedback, f.updatedAt = datetime()
      `,
      {
        teacherId: String(card.advisor_teacher_id),
        activityId: String(card.id),
        feedback: card.feedback,
      }
    );
  }
}

async function deleteCardGraph(cardId) {
  await runQuery(
    `
    MATCH (a:Activity {mysqlId: $activityId})
    DETACH DELETE a
    `,
    { activityId: String(cardId) }
  );
}

async function syncLearningObjectiveGraph(objectiveId) {
  const [rows] = await pool.query("SELECT * FROM learning_objectives WHERE id = ?", [objectiveId]);
  const objective = rows[0];
  if (!objective) return;

  await runQuery(
    `
    MERGE (lo:LearningObjective {mysqlId: $mysqlId})
    SET lo.topicCode = $topicCode,
        lo.topic = $topic,
        lo.lessonCode = $lessonCode,
        lo.lesson = $lesson,
        lo.objectiveCode = $objectiveCode,
        lo.content = $content,
        lo.description = $description,
        lo.category = $category
    `,
    {
      mysqlId: String(objective.id),
      topicCode: objective.topic_code || "",
      topic: objective.topic || "",
      lessonCode: objective.lesson_code || "",
      lesson: objective.lesson || "",
      objectiveCode: objective.objective_code || "",
      content: objective.content || "",
      description: objective.description || "",
      category: objective.category || "",
    }
  );
}

async function syncStudentSkillGraph(recordId) {
  const [rows] = await pool.query(
    `
    SELECT ss.id, ss.student_id, ss.skill_id, ss.level, ss.evidence, ss.card_id, ss.updated_at,
           ss.status, ss.source, ss.inference_reason,
           sk.name AS skill_name, sk.description AS skill_description
    FROM student_skills ss
    JOIN skills sk ON sk.id = ss.skill_id
    WHERE ss.id = ?
    `,
    [recordId]
  );
  const record = rows[0];
  if (!record) return;

  if (record.status === "rejected" || record.status === "suggested") {
    await deleteStudentSkillGraph(
      record.id,
      record.student_id,
      record.skill_id,
      record.card_id
    );
    return;
  }

  await syncMemberGraph(record.student_id);
  await syncSkillGraph(record.skill_id);

  await runQuery(
    `
    MATCH (s:Student {mysqlId: $studentId}), (sk:Skill {mysqlId: $skillId})
    MERGE (s)-[d:DEVELOPS]->(sk)
    SET d.level = $level,
        d.evidence = $evidence,
        d.status = $status,
        d.source = $source,
        d.inferenceReason = $inferenceReason,
        d.updatedAt = $updatedAt,
        d.mysqlRecordId = $recordId
  `,
    {
      studentId: String(record.student_id),
      skillId: String(record.skill_id),
      level: record.level,
      evidence: record.evidence || "",
      status: record.status || "confirmed",
      source: record.source || "manual",
      inferenceReason: record.inference_reason || "",
      updatedAt: record.updated_at ? new Date(record.updated_at).toISOString() : new Date().toISOString(),
      recordId: String(record.id),
    }
  );

  if (record.card_id) {
    await runQuery(
      `
      MATCH (a:Activity {mysqlId: $cardId})-[rel:EVIDENCE_FOR]->(sk:Skill {mysqlId: $skillId})
      DELETE rel
      `,
      { cardId: String(record.card_id), skillId: String(record.skill_id) }
    );
  }

  if (record.card_id && record.status === "confirmed") {
    await syncCardGraph(record.card_id);
    await runQuery(
      `
      MATCH (s:Student {mysqlId: $studentId})-[d:DEVELOPS]->(sk:Skill {mysqlId: $skillId}),
            (a:Activity {mysqlId: $cardId})
      WHERE d.mysqlRecordId = $recordId
      SET d.evidenceActivityId = $cardId
      MERGE (a)-[:EVIDENCE_FOR {level: d.level, status: d.status}]->(sk)
      `,
      {
        studentId: String(record.student_id),
        skillId: String(record.skill_id),
        cardId: String(record.card_id),
        recordId: String(record.id),
      }
    );
  }
}

async function deleteStudentSkillGraph(recordId, studentId, skillId, cardId = null) {
  await runQuery(
    `
    MATCH (s:Student {mysqlId: $studentId})-[d:DEVELOPS]->(sk:Skill {mysqlId: $skillId})
    WHERE d.mysqlRecordId = $recordId
    DELETE d
    `,
    { studentId: String(studentId), skillId: String(skillId), recordId: String(recordId) }
  );
  if (cardId) {
    await runQuery(
      `
      MATCH (a:Activity {mysqlId: $cardId})-[rel:EVIDENCE_FOR]->(sk:Skill {mysqlId: $skillId})
      DELETE rel
      `,
      { cardId: String(cardId), skillId: String(skillId) }
    );
  }
}

async function syncSkillGraph(skillId) {
  const [rows] = await pool.query("SELECT id, name, description FROM skills WHERE id = ?", [skillId]);
  const skill = rows[0];
  if (!skill) return;

  await runQuery(
    `
    MERGE (sk:Skill {mysqlId: $mysqlId})
    SET sk.name = $name, sk.description = $description
    `,
    {
      mysqlId: String(skill.id),
      name: skill.name,
      description: skill.description || "",
    }
  );
}

async function deleteSkillGraph(skillId) {
  await runQuery(
    `
    MATCH (sk:Skill {mysqlId: $skillId})
    DETACH DELETE sk
    `,
    { skillId: String(skillId) }
  );
}

async function deleteLearningObjectiveGraph(objectiveId) {
  await runQuery(
    `
    MATCH (lo:LearningObjective {mysqlId: $objectiveId})
    DETACH DELETE lo
    `,
    { objectiveId: String(objectiveId) }
  );
}

async function fullGraphResync() {
  const [students] = await pool.query("SELECT id FROM members WHERE role = 'student'");
  const [teachers] = await pool.query("SELECT id FROM members WHERE role = 'teacher'");
  const [columns] = await pool.query("SELECT id FROM board_columns");
  const [cards] = await pool.query("SELECT id FROM board_cards");
  const [objectives] = await pool.query("SELECT id FROM learning_objectives");
  const [skills] = await pool.query("SELECT id FROM skills");
  const [studentSkills] = await pool.query("SELECT id FROM student_skills");

  for (const teacher of teachers) await syncMemberGraph(teacher.id);
  for (const student of students) await syncMemberGraph(student.id);
  for (const column of columns) await syncWorkflowStage(column.id);
  for (const objective of objectives) await syncLearningObjectiveGraph(objective.id);
  for (const skill of skills) await syncSkillGraph(skill.id);
  for (const card of cards) await syncCardGraph(card.id);
  for (const record of studentSkills) await syncStudentSkillGraph(record.id);
}

module.exports = {
  initGraphSchema,
  syncMemberGraph,
  syncWorkflowStage,
  syncCardGraph,
  deleteCardGraph,
  syncLearningObjectiveGraph,
  deleteLearningObjectiveGraph,
  syncSkillGraph,
  deleteSkillGraph,
  syncStudentSkillGraph,
  deleteStudentSkillGraph,
  fullGraphResync,
};
