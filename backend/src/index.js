const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { pool, initDatabase } = require("./db");
const { signToken, requireAuth } = require("./auth");
const { getBoard } = require("./board-service");

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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((x) => x.trim()) || true,
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
          "You are EduBot, an AI assistant for teachers using Skyline Activity Board. Use the provided assigned students' profiles and activity board data to answer planning, analysis, reflection, and follow-up questions. Ground every answer in the actual student names, classes, schools, card titles, descriptions, locations, activity dates, and feedback provided. Be concise, practical, and educational. Format answers with clear line breaks between students or sections; use short paragraphs and numbered lists instead of one long block. Do not use markdown or special formatting symbols (no **, *, _, #, or backticks); write in plain text only. You may summarize across multiple students, compare progress, or recommend follow-up activities tied to specific visits or locations. Reply in the same language as the user's latest message.",
      }
    : {
        role: "system",
        content:
          "You are EduBot for Hong Kong primary school students using Skyline Activity Board. Keep answers brief (2-4 short sentences), warm, positive, and human. Use Hong Kong-style Traditional Chinese colloquial wording when the user writes Chinese (e.g., friendly daily expressions), with simple vocabulary and a caring teacher tone. Start by acknowledging feelings or effort, then give one clear next step. Keep the message encouraging, educational, and growth-minded: promote responsibility, time planning, reflection, and kindness. Do not sound robotic, preachy, or harsh. Avoid bullet points, long explanations, and markdown symbols (no **, *, _, #, or backticks). Reply in the same language as the user's latest message.",
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

  try {
    const aiRes = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        messages: boardContextMessage
          ? [systemMessage, ...styleExamples, boardContextMessage, ...normalizedMessages]
          : [systemMessage, ...styleExamples, ...normalizedMessages],
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

app.post("/api/columns", requireAuth, async (req, res) => {
  const { studentId, title } = req.body || {};
  if (!title) return res.status(400).json({ message: "Title is required" });
  if (req.user.role === "student" && req.user.id !== Number(studentId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const [orderRows] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM board_columns WHERE student_id = ?",
    [studentId]
  );
  const nextOrder = orderRows[0].next_order;
  const [result] = await pool.query(
    "INSERT INTO board_columns (student_id, title, sort_order) VALUES (?, ?, ?)",
    [studentId, title, nextOrder]
  );
  res.json({ id: String(result.insertId) });
});

app.patch("/api/columns/:columnId", requireAuth, async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ message: "Title is required" });
  await pool.query("UPDATE board_columns SET title = ? WHERE id = ?", [title, req.params.columnId]);
  res.json({ ok: true });
});

app.delete("/api/columns/:columnId", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM board_columns WHERE id = ?", [req.params.columnId]);
  res.json({ ok: true });
});

app.patch("/api/columns/reorder", requireAuth, async (req, res) => {
  const { columnIds } = req.body || {};
  if (!Array.isArray(columnIds)) return res.status(400).json({ message: "columnIds must be an array" });

  await Promise.all(
    columnIds.map((id, index) =>
      pool.query("UPDATE board_columns SET sort_order = ? WHERE id = ?", [index, Number(id)])
    )
  );
  res.json({ ok: true });
});

app.post("/api/cards", requireAuth, async (req, res) => {
  const { columnId, title, description = "", location = "", activityDate = "", images = [] } = req.body || {};
  if (!columnId || !title) return res.status(400).json({ message: "columnId and title are required" });
  const normalizedActivityDate = String(activityDate || "").trim() || null;

  const [orderRows] = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM board_cards WHERE column_id = ?",
    [columnId]
  );
  const nextOrder = orderRows[0].next_order;
  const [result] = await pool.query(
    "INSERT INTO board_cards (column_id, title, description, location, activity_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
    [columnId, title, description, location, normalizedActivityDate, nextOrder]
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
  res.json({ id: String(cardId) });
});

app.patch("/api/cards/:cardId", requireAuth, async (req, res) => {
  const { title, description, location, activityDate, images } = req.body || {};
  const normalizedActivityDate = String(activityDate || "").trim() || null;
  await pool.query(
    "UPDATE board_cards SET title = ?, description = ?, location = ?, activity_date = ? WHERE id = ?",
    [title, description, location, normalizedActivityDate, req.params.cardId]
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
  res.json({ ok: true });
});

app.delete("/api/cards/:cardId", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM board_cards WHERE id = ?", [req.params.cardId]);
  res.json({ ok: true });
});

async function startServer() {
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES || 20);
  const delayMs = Number(process.env.DB_CONNECT_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await initDatabase();
      app.listen(port, "0.0.0.0", () => {
        console.log(`API listening on http://0.0.0.0:${port}`);
      });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error("Database initialization failed:", error);
        process.exit(1);
      }
      console.log(
        `Database not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

startServer();
