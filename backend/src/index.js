require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { pool, initDatabase } = require("./db");
const { signToken, requireAuth } = require("./auth");
const { getBoard } = require("./board-service");
const { ensureNeo4jAppUser, verifyNeo4jConnection } = require("./neo4j");
const {
  initGraphSchema,
  syncCardGraph,
  deleteCardGraph,
  syncWorkflowStage,
  syncLearningObjectiveGraph,
  deleteLearningObjectiveGraph,
  syncSkillGraph,
  deleteSkillGraph,
  syncStudentSkillGraph,
  deleteStudentSkillGraph,
  fullGraphResync,
} = require("./graph-sync");
const { inferStudentSkills, inferStudentSkillsForCard } = require("./skill-inference");
const { autoLinkAllCards, autoLinkCardObjectives } = require("./objective-matching");
const { buildGraphRagContext } = require("./graph-rag");
const { generateLearningContent, applyGeneratedContent, loadCardContext, assertTeacherCanAccessStudent } = require("./content-generator");

async function runSkillInferenceForCard(cardId) {
  const recordIds = await inferStudentSkillsForCard(cardId);
  for (const recordId of recordIds) {
    await syncStudentSkillGraph(recordId);
  }
}

async function runSkillInferenceForStudent(studentId) {
  const recordIds = await inferStudentSkills(studentId);
  for (const recordId of recordIds) {
    await syncStudentSkillGraph(recordId);
  }
  return recordIds;
}

async function runSkillInferenceForAllStudents() {
  const [students] = await pool.query("SELECT id FROM members WHERE role = 'student'");
  for (const student of students) {
    await runSkillInferenceForStudent(student.id);
  }
}

async function runObjectiveAutoLinkForAllCards() {
  const result = await autoLinkAllCards();
  for (const item of result.results) {
    if (item.linked > 0) {
      await syncCardGraph(item.cardId);
      await runSkillInferenceForCard(item.cardId);
    }
  }
  return result;
}

const app = express();
const port = Number(process.env.PORT || 4000);
const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "");
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || "";
const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const geocodeCache = new Map();

const uploadsDir = path.resolve(__dirname, "../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".jpg");
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
});

function formatCardDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildStudentBoardContext(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return "No board data found for this student yet.";
  }

  const lines = [];
  for (const column of columns) {
    const cards = Array.isArray(column?.cards) ? column.cards : [];
    for (const card of cards) {
      const parts = [`[${column?.title || "Column"}]`, String(card?.title || "").trim() || "Untitled"];
      const description = String(card?.description || "").trim();
      const location = String(card?.location || "").trim();
      const date = formatCardDate(card?.activityDate || card?.createdAt);
      if (description) parts.push(`description: ${description}`);
      if (location) parts.push(`location: ${location}`);
      if (date) parts.push(`date: ${date}`);
      if (card?.feedback) parts.push(`teacher feedback: ${card.feedback}`);
      if (Array.isArray(card?.learningObjectives) && card.learningObjectives.length > 0) {
        parts.push(
          `learning objectives: ${card.learningObjectives.map((item) => item.objectiveCode || item.content).join("; ")}`
        );
      }
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No board data found for this student yet.";
}

async function buildTeacherStudentsContext(teacherId) {
  const [students] = await pool.query(
    `
    SELECT id, name, school, class_name
    FROM members
    WHERE role = 'student' AND advisor_teacher_id = ?
    ORDER BY name ASC
    `,
    [teacherId]
  );

  if (!students.length) {
    return "No assigned students found for this teacher.";
  }

  const sections = [];
  for (const student of students) {
    const boardColumns = await getBoard(student.id);
    sections.push(
      [
        `Student: ${student.name}`,
        `School: ${student.school || "N/A"}`,
        `Class: ${student.class_name || "N/A"}`,
        "Activities:",
        buildStudentBoardContext(boardColumns),
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

async function fetchUserProfileById(userId) {
  const [rows] = await pool.query(
    `
    SELECT
      m.id,
      m.email,
      m.name,
      m.role,
      m.avatar,
      m.school,
      m.class_name,
      m.advisor_teacher_id,
      m.bio,
      t.name AS teacher_name
    FROM members m
    LEFT JOIN members t ON t.id = m.advisor_teacher_id
    WHERE m.id = ?
    LIMIT 1
    `,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar || "",
    school: user.school || "",
    className: user.class_name || "",
    advisorTeacherId: user.advisor_teacher_id ? String(user.advisor_teacher_id) : "",
    advisorTeacherName: user.teacher_name || "",
    bio: user.bio || "",
  };
}

function toHistoryItem(row) {
  return {
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content || "",
    timestamp: new Date(row.created_at).toISOString(),
  };
}

const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((x) => x.trim()).filter(Boolean);
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "development"
        ? corsOrigins?.length
          ? corsOrigins
          : true
        : corsOrigins?.length
          ? corsOrigins
          : true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const [rows] = await pool.query(
    "SELECT id, email, name, role, password_hash FROM members WHERE email = ? LIMIT 1",
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ message: "Invalid credentials" });
  if (role && role !== user.role) return res.status(403).json({ message: "Role mismatch" });

  const token = signToken(user);
  const profile = await fetchUserProfileById(user.id);
  return res.json({ token, user: profile });
});

app.post("/api/ai/chat", requireAuth, async (req, res) => {
  if (!deepseekApiKey) {
    return res.status(500).json({ message: "DEEPSEEK_API_KEY is not configured" });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0) {
    return res.status(400).json({ message: "messages are required" });
  }

  const normalizedMessages = messages
    .map((msg) => ({
      role: msg?.role === "assistant" ? "assistant" : "user",
      content: String(msg?.content || "").trim(),
    }))
    .filter((msg) => msg.content.length > 0)
    .slice(-20);

  if (normalizedMessages.length === 0) {
    return res.status(400).json({ message: "messages are required" });
  }
  const latestUserMessage =
    [...normalizedMessages].reverse().find((msg) => msg.role === "user")?.content || "";

  const isTeacher = req.user.role === "teacher";
  const isStudent = req.user.role === "student";

  const systemMessage = isTeacher
    ? {
        role: "system",
        content:
          "You are EduBot, an AI assistant for teachers using Skyline Activity Board. Use the provided Graph RAG knowledge graph context and activity board data to answer planning, analysis, reflection, and follow-up questions. Ground every answer in actual student names, classes, visited locations, learning objectives, skills, stages, and feedback from the graph and board snapshots. Be concise, practical, and educational. Format answers with clear line breaks between students or sections; use short paragraphs and numbered lists instead of one long block. Do not use markdown or special formatting symbols (no **, *, _, #, or backticks); write in plain text only. You may summarize across multiple students, compare progress, or recommend follow-up activities tied to specific visits or locations. Reply in the same language as the user's latest message.",
      }
    : {
        role: "system",
        content:
          "You are EduBot for Hong Kong primary school students using Skyline Activity Board. Use the Graph RAG knowledge graph context and board snapshot to ground your answers in the student's real activities, visited locations, learning objectives, and skills. Keep answers brief (2-4 short sentences), warm, positive, and human. Use Hong Kong-style Traditional Chinese colloquial wording when the user writes Chinese (e.g., friendly daily expressions), with simple vocabulary and a caring teacher tone. Start by acknowledging feelings or effort, then give one clear next step. Keep the message encouraging, educational, and growth-minded: promote responsibility, time planning, reflection, and kindness. Do not sound robotic, preachy, or harsh. Avoid bullet points, long explanations, and markdown symbols (no **, *, _, #, or backticks). Reply in the same language as the user's latest message.",
      };

  const styleExamples = isTeacher
    ? [
        {
          role: "user",
          content: "Summarize the field trips we completed this week.",
        },
        {
          role: "assistant",
          content:
            "This week your students completed visits including the science museum and a waterfront field trip. Emma finished her reflection card, while James still has an in-progress museum note. A good next step is to ask each student to add one learning takeaway to their completed cards.",
        },
        {
          role: "user",
          content:
            "Based on the student's recent visit to the science museum, what follow-up activity would you recommend?",
        },
        {
          role: "assistant",
          content:
            "Since the student already visited the science museum, a strong follow-up is a short hands-on experiment card about forces or ecosystems, then a reflection entry linking what they saw to one real-life example.",
        },
      ]
    : [
        {
          role: "user",
          content: "我不知道要先做哪個活動。",
        },
        {
          role: "assistant",
          content:
            "唔緊要，你肯開始已經好叻。你可以先揀一張最易入手、10分鐘內做到第一步嘅卡，做完再搬去 In Progress，會更有成功感。",
        },
        {
          role: "user",
          content: "我卡住了，作業好多。",
        },
        {
          role: "assistant",
          content:
            "我明你，而家多嘢做會有壓力。你不如先做最細嗰步，例如先完成第一題；一步一步嚟，你會見到自己真係有進步。",
        },
      ];

  const defaultNextQuestion = isTeacher
    ? "Which student should I follow up with first?"
    : "你可唔可以幫我揀下一個最容易開始嘅步驟？";

  let boardContextMessage = null;
  if (isStudent) {
    try {
      const boardColumns = await getBoard(req.user.id);
      boardContextMessage = {
        role: "system",
        content: `Current logged-in student's board snapshot:\n${buildStudentBoardContext(boardColumns)}`,
      };
    } catch (error) {
      console.error("Failed to build student board context:", error);
    }
  } else if (isTeacher) {
    try {
      const teacherContext = await buildTeacherStudentsContext(req.user.id);
      boardContextMessage = {
        role: "system",
        content: `Assigned students and their activity board data:\n${teacherContext}`,
      };
    } catch (error) {
      console.error("Failed to build teacher students context:", error);
    }
  }

  let graphContextMessage = null;
  try {
    const graphContext = await buildGraphRagContext({
      userId: req.user.id,
      role: req.user.role,
      question: latestUserMessage,
    });
    if (graphContext) {
      graphContextMessage = {
        role: "system",
        content: graphContext,
      };
    }
  } catch (error) {
    console.error("Failed to build graph RAG context:", error);
  }

  const chatMessages = [
    systemMessage,
    ...styleExamples,
    boardContextMessage,
    graphContextMessage,
    ...normalizedMessages,
  ].filter(Boolean);

  try {
    const aiRes = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages: chatMessages,
        temperature: isTeacher ? 0.6 : 0.85,
        top_p: 0.9,
        frequency_penalty: 0.35,
        max_tokens: isTeacher ? 420 : 220,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error("DeepSeek API error:", aiRes.status, errorText);
      return res.status(502).json({ message: "DeepSeek request failed" });
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || typeof reply !== "string") {
      return res.status(502).json({ message: "Invalid DeepSeek response" });
    }
    let nextQuestion = defaultNextQuestion;

    try {
      const followUpRes = await fetch(`${deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: deepseekModel,
          messages: [
            {
              role: "system",
              content: isTeacher
                ? "You create one short follow-up question for a teacher reviewing student experiential learning. The question must be practical and directly based on the assistant reply. Return only one question in the same language as the assistant reply, max 40 characters, no quotes, no list."
                : "You create one short follow-up question for a Hong Kong primary student. The question must be positive, practical, and directly based on the assistant reply. Return only one question in Traditional Chinese, max 22 characters, no quotes, no list.",
            },
            {
              role: "user",
              content: `Assistant reply: ${reply}`,
            },
          ],
          temperature: 0.8,
          top_p: 0.9,
          max_tokens: 60,
        }),
      });

      if (followUpRes.ok) {
        const followUpData = await followUpRes.json();
        const rawQuestion = String(followUpData?.choices?.[0]?.message?.content || "").trim();
        const firstLine = rawQuestion.split("\n")[0].trim();
        if (firstLine) {
          nextQuestion = firstLine.endsWith("？") ? firstLine : `${firstLine}？`;
        }
      }
    } catch (_error) {
      // fallback to defaultNextQuestion
    }

    const trimmedReply = reply.trim();
    if (latestUserMessage) {
      await pool.query("INSERT INTO ai_chat_messages (user_id, role, content) VALUES (?, 'user', ?)", [
        req.user.id,
        latestUserMessage,
      ]);
      await pool.query("INSERT INTO ai_chat_messages (user_id, role, content) VALUES (?, 'assistant', ?)", [
        req.user.id,
        trimmedReply,
      ]);
    }

    return res.json({ reply: trimmedReply, nextQuestion });
  } catch (error) {
    console.error("DeepSeek request error:", error);
    return res.status(502).json({ message: "DeepSeek request failed" });
  }
});

app.get("/api/ai/chat/history", requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
  const [rows] = await pool.query(
    `
    SELECT id, role, content, created_at
    FROM ai_chat_messages
    WHERE user_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
    `,
    [req.user.id, limit]
  );
  return res.json({ messages: rows.map(toHistoryItem) });
});

app.get("/api/content-studio/context", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const studentId = Number(req.query.studentId);
  const cardId = Number(req.query.cardId);
  if (!studentId || !cardId) {
    return res.status(400).json({ message: "studentId and cardId are required" });
  }
  try {
    const allowed =
      req.user.role === "admin" ||
      (await assertTeacherCanAccessStudent(req.user.id, studentId, req.user.role));
    if (!allowed) return res.status(403).json({ message: "Forbidden" });
    const context = await loadCardContext(studentId, cardId);
    if (!context) return res.status(404).json({ message: "Card not found" });
    return res.json(context);
  } catch (error) {
    if (error.statusCode === 403) return res.status(403).json({ message: "Forbidden" });
    console.error("Content studio context error:", error);
    return res.status(500).json({ message: "Failed to load context" });
  }
});

app.post("/api/ai/generate-content", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (!deepseekApiKey) {
    return res.status(500).json({ message: "DEEPSEEK_API_KEY is not configured" });
  }

  const studentId = Number(req.body?.studentId);
  const cardId = Number(req.body?.cardId);
  const type = String(req.body?.type || "").trim();
  const options = req.body?.options || {};

  if (!studentId || !cardId || !type) {
    return res.status(400).json({ message: "studentId, cardId and type are required" });
  }

  try {
    const result = await generateLearningContent({
      teacherId: req.user.id,
      studentId,
      cardId,
      type,
      options: { ...options, userRole: req.user.role },
      deepseekApiKey,
      deepseekBaseUrl,
      deepseekModel,
    });
    return res.json(result);
  } catch (error) {
    if (error.statusCode === 403) return res.status(403).json({ message: "Forbidden" });
    if (error.statusCode === 404) return res.status(404).json({ message: "Card not found" });
    console.error("Generate content error:", error);
    return res.status(502).json({ message: error.message || "Failed to generate content" });
  }
});

app.post("/api/ai/apply-generated-content", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const studentId = Number(req.body?.studentId);
  const cardId = Number(req.body?.cardId);
  const type = String(req.body?.type || "").trim();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const applyMode = String(req.body?.applyMode || "").trim();

  if (!studentId || !cardId || !type) {
    return res.status(400).json({ message: "studentId, cardId and type are required" });
  }

  try {
    const result = await applyGeneratedContent({
      teacherId: req.user.id,
      studentId,
      cardId,
      type,
      items,
      applyMode,
      userRole: req.user.role,
    });
    return res.json(result);
  } catch (error) {
    if (error.statusCode === 403) return res.status(403).json({ message: "Forbidden" });
    if (error.statusCode === 404) return res.status(404).json({ message: "Card not found" });
    console.error("Apply generated content error:", error);
    return res.status(400).json({ message: error.message || "Failed to apply content" });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  const profile = await fetchUserProfileById(req.user.id);
  if (!profile) return res.status(404).json({ message: "Profile not found" });
  return res.json(profile);
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const school = String(req.body?.school || "").trim();
  const className = String(req.body?.className || "").trim();
  const bio = String(req.body?.bio || "").trim();
  if (req.user.role !== "student" && !name) {
    return res.status(400).json({ message: "Name is required" });
  }

  if (req.user.role === "student") {
    await pool.query("UPDATE members SET bio = ? WHERE id = ?", [bio || null, req.user.id]);
  } else {
    await pool.query(
      "UPDATE members SET name = ?, school = ?, class_name = ?, bio = ? WHERE id = ?",
      [name, school, className, bio || null, req.user.id]
    );
  }

  const profile = await fetchUserProfileById(req.user.id);
  return res.json(profile);
});

app.patch("/api/profile/password", requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "currentPassword and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters" });
  }

  const [rows] = await pool.query("SELECT password_hash FROM members WHERE id = ? LIMIT 1", [req.user.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ message: "User not found" });
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ message: "Current password is incorrect" });

  const nextHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE members SET password_hash = ? WHERE id = ?", [nextHash, req.user.id]);
  return res.json({ ok: true });
});

app.get("/api/students", requireAuth, async (req, res) => {
  if (req.user.role === "student") {
    const [rows] = await pool.query("SELECT id, name FROM members WHERE id = ?", [req.user.id]);
    return res.json(rows.map((r) => ({ id: String(r.id), name: r.name })));
  }

  if (req.user.role === "teacher") {
    const [rows] = await pool.query(
      "SELECT id, name, class_name FROM members WHERE role = 'student' AND advisor_teacher_id = ? ORDER BY id ASC",
      [req.user.id]
    );
    return res.json(rows.map((r) => ({ id: String(r.id), name: r.name, className: r.class_name || "" })));
  }

  const [rows] = await pool.query("SELECT id, name, class_name FROM members WHERE role = 'student' ORDER BY id ASC");
  return res.json(rows.map((r) => ({ id: String(r.id), name: r.name, className: r.class_name || "" })));
});

app.get("/api/students/:studentId/profile", requireAuth, async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!studentId) return res.status(400).json({ message: "Invalid student id" });
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (req.user.role === "teacher") {
    const [rows] = await pool.query(
      "SELECT advisor_teacher_id FROM members WHERE id = ? AND role = 'student' LIMIT 1",
      [studentId]
    );
    const target = rows[0];
    if (!target || Number(target.advisor_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your assigned student" });
    }
  }

  const profile = await fetchUserProfileById(studentId);
  if (!profile || profile.role !== "student") {
    return res.status(404).json({ message: "Student not found" });
  }
  return res.json(profile);
});

app.patch("/api/students/:studentId/profile", requireAuth, async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!studentId) return res.status(400).json({ message: "Invalid student id" });
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (req.user.role === "teacher") {
    const [rows] = await pool.query(
      "SELECT advisor_teacher_id FROM members WHERE id = ? AND role = 'student' LIMIT 1",
      [studentId]
    );
    const target = rows[0];
    if (!target || Number(target.advisor_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your assigned student" });
    }
  }

  const name = String(req.body?.name || "").trim();
  const school = String(req.body?.school || "").trim();
  const className = String(req.body?.className || "").trim();
  const bio = String(req.body?.bio || "").trim();

  if (!name) {
    return res.status(400).json({ message: "Name is required" });
  }

  await pool.query("UPDATE members SET name = ?, school = ?, class_name = ?, bio = ? WHERE id = ? AND role = 'student'", [
    name,
    school,
    className,
    bio || null,
    studentId,
  ]);

  const profile = await fetchUserProfileById(studentId);
  if (!profile || profile.role !== "student") {
    return res.status(404).json({ message: "Student not found" });
  }
  return res.json(profile);
});

app.get("/api/board/:studentId", requireAuth, async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (req.user.role === "student" && req.user.id !== studentId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (req.user.role === "teacher") {
    const [rows] = await pool.query(
      "SELECT advisor_teacher_id FROM members WHERE id = ? AND role = 'student' LIMIT 1",
      [studentId]
    );
    const target = rows[0];
    if (!target || Number(target.advisor_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Forbidden: not your assigned student" });
    }
  }
  const columns = await getBoard(studentId);
  return res.json({ columns });
});

app.get("/api/locations/suggest", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) return res.json({ suggestions: [] });

  if (!googleMapsApiKey) {
    return res.status(500).json({ message: "GOOGLE_MAPS_API_KEY is not configured", suggestions: [] });
  }

  try {
    const params = new URLSearchParams({
      input: q,
      key: googleMapsApiKey,
      components: "country:hk",
      region: "hk",
    });
    const googleRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    );
    const data = await googleRes.json();
    const suggestions = Array.isArray(data?.predictions)
      ? data.predictions.map((x) => x.description).slice(0, 8)
      : [];
    return res.json({ suggestions });
  } catch (_error) {
    return res.status(502).json({ message: "Google Places request failed", suggestions: [] });
  }
});

app.post("/api/locations/geocode", requireAuth, async (req, res) => {
  const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
  if (!googleMapsApiKey) {
    return res.status(500).json({ message: "GOOGLE_MAPS_API_KEY is not configured", coordinates: {} });
  }

  const uniqueLocations = [...new Set(locations.map((x) => String(x || "").trim()).filter(Boolean))];
  const coordinates = {};

  await Promise.all(
    uniqueLocations.map(async (location) => {
      if (geocodeCache.has(location)) {
        coordinates[location] = geocodeCache.get(location);
        return;
      }

      try {
        const params = new URLSearchParams({
          address: location,
          key: googleMapsApiKey,
          region: "hk",
          language: /[\u4e00-\u9fff]/.test(location) ? "zh-HK" : "en",
          components: "country:HK",
        });
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
        );
        const data = await geoRes.json();
        const result = data?.results?.[0]?.geometry?.location;
        if (result && typeof result.lat === "number" && typeof result.lng === "number") {
          const value = [result.lat, result.lng];
          geocodeCache.set(location, value);
          coordinates[location] = value;
        }
      } catch (_error) {
        // ignore single geocode failure
      }
    })
  );

  return res.json({ coordinates });
});

app.post("/api/uploads", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  return res.json({ url: `${publicUrl}/uploads/${req.file.filename}` });
});

async function getColumnMeta(columnId) {
  const [rows] = await pool.query(
    "SELECT id, student_id, is_fixed_stage, stage_key FROM board_columns WHERE id = ? LIMIT 1",
    [columnId]
  );
  return rows[0] || null;
}

app.post("/api/columns", requireAuth, async (req, res) => {
  const { studentId, title } = req.body || {};
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (req.user.role === "student" && req.user.id !== Number(studentId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const [orderRows] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), 2) + 1 AS next_order FROM board_columns WHERE student_id = ?",
    [studentId]
  );
  const nextOrder = Math.max(orderRows[0].next_order, 3);
  const [result] = await pool.query(
    "INSERT INTO board_columns (student_id, title, sort_order, is_fixed_stage) VALUES (?, ?, ?, 0)",
    [studentId, title, nextOrder]
  );
  await syncWorkflowStage(result.insertId);
  res.json({ id: String(result.insertId) });
});

app.patch("/api/columns/:columnId", requireAuth, async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ message: "Title is required" });
  const column = await getColumnMeta(req.params.columnId);
  if (!column) return res.status(404).json({ message: "Column not found" });
  if (column.is_fixed_stage) {
    return res.status(400).json({ message: "Fixed stage columns cannot be renamed" });
  }
  await pool.query("UPDATE board_columns SET title = ? WHERE id = ?", [title, req.params.columnId]);
  await syncWorkflowStage(req.params.columnId);
  res.json({ ok: true });
});

app.delete("/api/columns/:columnId", requireAuth, async (req, res) => {
  const column = await getColumnMeta(req.params.columnId);
  if (!column) return res.status(404).json({ message: "Column not found" });
  if (column.is_fixed_stage) {
    return res.status(400).json({ message: "Fixed stage columns cannot be deleted" });
  }
  await pool.query("DELETE FROM board_columns WHERE id = ?", [req.params.columnId]);
  res.json({ ok: true });
});

app.patch("/api/columns/reorder", requireAuth, async (req, res) => {
  const { columnIds, studentId } = req.body || {};
  if (!Array.isArray(columnIds)) return res.status(400).json({ message: "columnIds must be an array" });

  const [fixedColumns] = await pool.query(
  `
    SELECT id, stage_key
    FROM board_columns
    WHERE student_id = ? AND is_fixed_stage = 1
    ORDER BY sort_order ASC, id ASC
  `,
    [studentId]
  );
  const fixedIds = fixedColumns.map((col) => String(col.id));
  const movableIds = columnIds.filter((id) => !fixedIds.includes(String(id)));
  const finalOrder = [...fixedIds, ...movableIds];

  await Promise.all(
    finalOrder.map((id, index) =>
      pool.query("UPDATE board_columns SET sort_order = ? WHERE id = ?", [index, Number(id)])
    )
  );
  for (const id of finalOrder) await syncWorkflowStage(id);
  res.json({ ok: true, columnIds: finalOrder });
});

app.post("/api/cards", requireAuth, async (req, res) => {
  const {
    columnId,
    title,
    description = "",
    location = "",
    activityDate = "",
    images = [],
    checkpointId = null,
    lat = null,
    lng = null,
    recordType = "general",
    source = "manual",
  } = req.body || {};
  if (!columnId || !title) return res.status(400).json({ message: "columnId and title are required" });
  const normalizedActivityDate = String(activityDate || "").trim() || null;
  const normalizedSource = ["manual", "imported", "ai_generated"].includes(source) ? source : "manual";

  const [orderRows] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM board_cards WHERE column_id = ?",
    [columnId]
  );
  const nextOrder = orderRows[0].next_order;
  const [result] = await pool.query(
    `
    INSERT INTO board_cards (
      column_id, title, description, location, activity_date, sort_order,
      checkpoint_id, lat, lng, record_type, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      columnId,
      title,
      description,
      location,
      normalizedActivityDate,
      nextOrder,
      checkpointId,
      lat,
      lng,
      recordType,
      normalizedSource,
    ]
  );
  const cardId = result.insertId;

  await Promise.all(
    images.map((url, index) =>
      pool.query("INSERT INTO card_images (card_id, image_url, sort_order) VALUES (?, ?, ?)", [
        cardId,
        url,
        index,
      ])
    )
  );
  await syncCardGraph(cardId);
  await runSkillInferenceForCard(cardId);
  res.json({ id: String(cardId) });
});

app.patch("/api/cards/:cardId", requireAuth, async (req, res) => {
  const { title, description, location, activityDate, images, checkpointId, lat, lng, recordType } = req.body || {};
  const normalizedActivityDate = String(activityDate || "").trim() || null;
  await pool.query(
    `
    UPDATE board_cards
    SET title = ?, description = ?, location = ?, activity_date = ?,
        checkpoint_id = COALESCE(?, checkpoint_id),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        record_type = COALESCE(?, record_type)
    WHERE id = ?
    `,
    [
      title,
      description,
      location,
      normalizedActivityDate,
      checkpointId ?? null,
      lat ?? null,
      lng ?? null,
      recordType ?? null,
      req.params.cardId,
    ]
  );

  if (Array.isArray(images)) {
    await pool.query("DELETE FROM card_images WHERE card_id = ?", [req.params.cardId]);
    await Promise.all(
      images.map((url, index) =>
        pool.query("INSERT INTO card_images (card_id, image_url, sort_order) VALUES (?, ?, ?)", [
          req.params.cardId,
          url,
          index,
        ])
      )
    );
  }
  await syncCardGraph(req.params.cardId);
  await runSkillInferenceForCard(req.params.cardId);
  res.json({ ok: true });
});

app.patch("/api/cards/:cardId/move", requireAuth, async (req, res) => {
  const { toColumnId, toIndex } = req.body || {};
  if (!toColumnId || toIndex === undefined) {
    return res.status(400).json({ message: "toColumnId and toIndex are required" });
  }
  await pool.query("UPDATE board_cards SET column_id = ?, sort_order = ? WHERE id = ?", [
    toColumnId,
    toIndex,
    req.params.cardId,
  ]);
  await syncCardGraph(req.params.cardId);
  await runSkillInferenceForCard(req.params.cardId);
  res.json({ ok: true });
});

app.patch("/api/cards/:cardId/feedback", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Only teacher/admin can add feedback" });
  }
  await pool.query("UPDATE board_cards SET feedback = ? WHERE id = ?", [
    req.body?.feedback || "",
    req.params.cardId,
  ]);
  await syncCardGraph(req.params.cardId);
  await runSkillInferenceForCard(req.params.cardId);
  res.json({ ok: true });
});

app.patch("/api/cards/:cardId/objectives", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Only teacher/admin can assign learning objectives" });
  }
  const objectiveIds = Array.isArray(req.body?.objectiveIds)
    ? req.body.objectiveIds.map((id) => Number(id)).filter(Boolean)
    : [];

  await pool.query("DELETE FROM card_learning_objectives WHERE card_id = ?", [req.params.cardId]);
  await Promise.all(
    objectiveIds.map((objectiveId) =>
      pool.query(
        "INSERT INTO card_learning_objectives (card_id, objective_id, assigned_by) VALUES (?, ?, ?)",
        [req.params.cardId, objectiveId, req.user.id]
      )
    )
  );
  await syncCardGraph(req.params.cardId);
  await runSkillInferenceForCard(req.params.cardId);
  res.json({ ok: true, objectiveIds: objectiveIds.map(String) });
});

app.delete("/api/cards/:cardId", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT bc.student_id
    FROM board_cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [req.params.cardId]
  );
  const studentId = rows[0]?.student_id;
  await pool.query("DELETE FROM board_cards WHERE id = ?", [req.params.cardId]);
  await deleteCardGraph(req.params.cardId);
  if (studentId) await runSkillInferenceForStudent(studentId);
  res.json({ ok: true });
});

app.get("/api/learning-objectives", requireAuth, async (req, res) => {
  const category = String(req.query.category || "").trim();
  const params = [];
  let where = "";
  if (category) {
    where = "WHERE category = ?";
    params.push(category);
  }
  const [rows] = await pool.query(
    `
    SELECT id, topic_code, topic, lesson_code, lesson, content_code, content,
           objective_code, description, category, created_at
    FROM learning_objectives
    ${where}
    ORDER BY category ASC, topic ASC, lesson ASC, objective_code ASC
    `,
    params
  );
  res.json({
    objectives: rows.map((row) => ({
      id: String(row.id),
      topicCode: row.topic_code,
      topic: row.topic,
      lessonCode: row.lesson_code,
      lesson: row.lesson,
      contentCode: row.content_code,
      content: row.content,
      objectiveCode: row.objective_code,
      description: row.description,
      category: row.category,
      createdAt: row.created_at,
    })),
  });
});

app.post("/api/learning-objectives", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const {
    topicCode = "",
    topic = "",
    lessonCode = "",
    lesson = "",
    contentCode = "",
    content = "",
    objectiveCode,
    description = "",
    category = "custom",
  } = req.body || {};
  if (!objectiveCode || !content) {
    return res.status(400).json({ message: "objectiveCode and content are required" });
  }
  const [result] = await pool.query(
    `
    INSERT INTO learning_objectives (
      topic_code, topic, lesson_code, lesson, content_code, content,
      objective_code, description, category, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [topicCode, topic, lessonCode, lesson, contentCode, content, objectiveCode, description, category, req.user.id]
  );
  await syncLearningObjectiveGraph(result.insertId);
  res.json({ id: String(result.insertId) });
});

app.patch("/api/learning-objectives/:objectiveId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const {
    topicCode = "",
    topic = "",
    lessonCode = "",
    lesson = "",
    contentCode = "",
    content = "",
    objectiveCode,
    description = "",
    category = "custom",
  } = req.body || {};
  await pool.query(
    `
    UPDATE learning_objectives
    SET topic_code = ?, topic = ?, lesson_code = ?, lesson = ?, content_code = ?, content = ?,
        objective_code = ?, description = ?, category = ?
    WHERE id = ?
    `,
    [topicCode, topic, lessonCode, lesson, contentCode, content, objectiveCode, description, category, req.params.objectiveId]
  );
  await syncLearningObjectiveGraph(req.params.objectiveId);
  res.json({ ok: true });
});

app.delete("/api/learning-objectives/:objectiveId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  await pool.query("DELETE FROM learning_objectives WHERE id = ?", [req.params.objectiveId]);
  await deleteLearningObjectiveGraph(req.params.objectiveId);
  res.json({ ok: true });
});

app.post("/api/cards/auto-link-objectives", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const cardId = req.body?.cardId ? Number(req.body.cardId) : null;
  if (cardId) {
    const result = await autoLinkCardObjectives(cardId, { assignedBy: req.user.id });
    if (result.linked > 0) {
      await syncCardGraph(cardId);
      await runSkillInferenceForCard(cardId);
    }
    return res.json(result);
  }

  const result = await runObjectiveAutoLinkForAllCards();
  res.json(result);
});

app.post("/api/learning-objectives/import-curriculum", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const { importCurriculumObjectives } = require("./learning-import");
  const inserted = await importCurriculumObjectives();
  const [objectives] = await pool.query("SELECT id FROM learning_objectives");
  for (const objective of objectives) await syncLearningObjectiveGraph(objective.id);
  res.json({ inserted });
});

app.get("/api/skills", requireAuth, async (_req, res) => {
  const [rows] = await pool.query("SELECT id, name, description, created_at FROM skills ORDER BY name ASC");
  res.json({
    skills: rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description || "",
      createdAt: row.created_at,
    })),
  });
});

app.post("/api/skills", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!name) return res.status(400).json({ message: "name is required" });
  const [result] = await pool.query("INSERT INTO skills (name, description, created_by) VALUES (?, ?, ?)", [
    name,
    description,
    req.user.id,
  ]);
  await syncSkillGraph(result.insertId);
  res.json({ id: String(result.insertId) });
});

app.patch("/api/skills/:skillId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!name) return res.status(400).json({ message: "name is required" });
  await pool.query("UPDATE skills SET name = ?, description = ? WHERE id = ?", [
    name,
    description,
    req.params.skillId,
  ]);
  await syncSkillGraph(req.params.skillId);
  res.json({ ok: true });
});

app.delete("/api/skills/:skillId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  await pool.query("DELETE FROM skills WHERE id = ?", [req.params.skillId]);
  await deleteSkillGraph(req.params.skillId);
  res.json({ ok: true });
});

app.get("/api/students/:studentId/skills", requireAuth, async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (req.user.role === "student" && req.user.id !== studentId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (req.user.role === "teacher") {
    const [rows] = await pool.query(
      "SELECT advisor_teacher_id FROM members WHERE id = ? AND role = 'student' LIMIT 1",
      [studentId]
    );
    if (!rows[0] || Number(rows[0].advisor_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  const [records] = await pool.query(
    `
    SELECT ss.id, ss.student_id, ss.skill_id, ss.level, ss.evidence, ss.card_id, ss.updated_at,
           ss.status, ss.source, ss.inference_reason,
           sk.name AS skill_name, sk.description AS skill_description,
           c.title AS card_title
    FROM student_skills ss
    JOIN skills sk ON sk.id = ss.skill_id
    LEFT JOIN board_cards c ON c.id = ss.card_id
    WHERE ss.student_id = ? AND ss.status != 'rejected'
    ORDER BY FIELD(ss.status, 'suggested', 'confirmed'), sk.name ASC, c.title ASC
    `,
    [studentId]
  );

  res.json({
    records: records.map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      skillId: String(row.skill_id),
      skillName: row.skill_name,
      skillDescription: row.skill_description || "",
      level: row.level,
      evidence: row.evidence || "",
      cardId: row.card_id ? String(row.card_id) : "",
      cardTitle: row.card_title || "",
      status: row.status || "confirmed",
      source: row.source || "manual",
      inferenceReason: row.inference_reason || "",
      updatedAt: row.updated_at,
    })),
  });
});

app.post("/api/students/:studentId/skills", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const studentId = Number(req.params.studentId);
  const skillId = Number(req.body?.skillId);
  const level = String(req.body?.level || "developing");
  const evidence = String(req.body?.evidence || "").trim();
  const cardId = req.body?.cardId ? Number(req.body.cardId) : null;
  if (!skillId) return res.status(400).json({ message: "skillId is required" });

  let recordId = null;
  if (cardId) {
    const [existing] = await pool.query(
      "SELECT id FROM student_skills WHERE student_id = ? AND skill_id = ? AND card_id = ? LIMIT 1",
      [studentId, skillId, cardId]
    );
    if (existing[0]) {
      await pool.query(
        `
        UPDATE student_skills
        SET level = ?, evidence = ?, status = 'confirmed', source = 'manual',
            inference_reason = NULL, updated_by = ?
        WHERE id = ?
        `,
        [level, evidence, req.user.id, existing[0].id]
      );
      recordId = existing[0].id;
    } else {
      const [result] = await pool.query(
        `
        INSERT INTO student_skills (
          student_id, skill_id, level, evidence, card_id, status, source, updated_by
        ) VALUES (?, ?, ?, ?, ?, 'confirmed', 'manual', ?)
        `,
        [studentId, skillId, level, evidence, cardId, req.user.id]
      );
      recordId = result.insertId;
    }
  } else {
    const [existing] = await pool.query(
      "SELECT id FROM student_skills WHERE student_id = ? AND skill_id = ? AND card_id IS NULL LIMIT 1",
      [studentId, skillId]
    );
    if (existing[0]) {
      await pool.query(
        `
        UPDATE student_skills
        SET level = ?, evidence = ?, status = 'confirmed', source = 'manual',
            inference_reason = NULL, updated_by = ?
        WHERE id = ?
        `,
        [level, evidence, req.user.id, existing[0].id]
      );
      recordId = existing[0].id;
    } else {
      const [result] = await pool.query(
        `
        INSERT INTO student_skills (
          student_id, skill_id, level, evidence, card_id, status, source, updated_by
        ) VALUES (?, ?, ?, ?, NULL, 'confirmed', 'manual', ?)
        `,
        [studentId, skillId, level, evidence, req.user.id]
      );
      recordId = result.insertId;
    }
  }

  await syncStudentSkillGraph(recordId);
  res.json({ id: String(recordId) });
});

app.patch("/api/students/:studentId/skills/:recordId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const level = String(req.body?.level || "developing");
  const evidence = String(req.body?.evidence || "").trim();
  const cardId = req.body?.cardId ? Number(req.body.cardId) : null;
  await pool.query(
    `
    UPDATE student_skills
    SET level = ?, evidence = ?, card_id = ?, status = 'confirmed', source = 'manual',
        inference_reason = NULL, updated_by = ?
    WHERE id = ? AND student_id = ?
    `,
    [level, evidence, cardId, req.user.id, req.params.recordId, req.params.studentId]
  );
  await syncStudentSkillGraph(req.params.recordId);
  res.json({ ok: true });
});

app.post("/api/students/:studentId/skills/infer", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const studentId = Number(req.params.studentId);
  const recordIds = await runSkillInferenceForStudent(studentId);
  res.json({ ok: true, recordIds: recordIds.map(String) });
});

app.post("/api/students/:studentId/skills/:recordId/confirm", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const level = req.body?.level ? String(req.body.level) : null;
  const evidence = req.body?.evidence !== undefined ? String(req.body.evidence).trim() : null;
  const cardId = req.body?.cardId !== undefined ? (req.body.cardId ? Number(req.body.cardId) : null) : null;

  const [rows] = await pool.query(
    "SELECT id, status FROM student_skills WHERE id = ? AND student_id = ? LIMIT 1",
    [req.params.recordId, req.params.studentId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Record not found" });

  const updates = ["status = 'confirmed'", "updated_by = ?"];
  const params = [req.user.id];
  if (level) {
    updates.push("level = ?");
    params.push(level);
  }
  if (evidence !== null) {
    updates.push("evidence = ?");
    params.push(evidence);
  }
  if (cardId !== null) {
    updates.push("card_id = ?");
    params.push(cardId);
  }
  params.push(req.params.recordId, req.params.studentId);
  await pool.query(
    `UPDATE student_skills SET ${updates.join(", ")} WHERE id = ? AND student_id = ?`,
    params
  );
  await syncStudentSkillGraph(req.params.recordId);
  res.json({ ok: true });
});

app.post("/api/students/:studentId/skills/:recordId/reject", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const [rows] = await pool.query(
    "SELECT student_id, skill_id, card_id FROM student_skills WHERE id = ? AND student_id = ? LIMIT 1",
    [req.params.recordId, req.params.studentId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Record not found" });
  await pool.query(
    "UPDATE student_skills SET status = 'rejected', updated_by = ? WHERE id = ?",
    [req.user.id, req.params.recordId]
  );
  await syncStudentSkillGraph(req.params.recordId);
  res.json({ ok: true });
});

app.delete("/api/students/:studentId/skills/:recordId", requireAuth, async (req, res) => {
  if (req.user.role !== "teacher" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  const [rows] = await pool.query(
    "SELECT student_id, skill_id, card_id FROM student_skills WHERE id = ? LIMIT 1",
    [req.params.recordId]
  );
  const record = rows[0];
  if (!record) return res.status(404).json({ message: "Record not found" });
  await pool.query("DELETE FROM student_skills WHERE id = ?", [req.params.recordId]);
  await deleteStudentSkillGraph(
    req.params.recordId,
    record.student_id,
    record.skill_id,
    record.card_id
  );
  res.json({ ok: true });
});

async function startServer() {
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES || 20);
  const delayMs = Number(process.env.DB_CONNECT_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await initDatabase();
      const uploadsDir = path.resolve(__dirname, "../uploads");
      const publicUrl = (process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");
      const { importAllLearningContent } = require("./learning-import");
      const importResult = await importAllLearningContent(uploadsDir, publicUrl);
      console.log(
        `Learning dataset import complete: ${importResult.totalCards} cards, ${importResult.objectives} objectives`
      );
      await ensureNeo4jAppUser();
      await verifyNeo4jConnection();
      await initGraphSchema();
      await fullGraphResync();
      console.log("Neo4j graph sync complete");
      const objectiveLinkResult = await runObjectiveAutoLinkForAllCards();
      console.log(
        `Objective auto-link complete: ${objectiveLinkResult.totalLinked} links across ${objectiveLinkResult.totalCards} cards`
      );
      await runSkillInferenceForAllStudents();
      console.log("Skill inference complete for all students");
      app.listen(port, "0.0.0.0", () => {
        console.log(`API listening on http://0.0.0.0:${port}`);
      });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error("Server initialization failed:", error);
        process.exit(1);
      }
      console.log(
        `Services not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

startServer();
