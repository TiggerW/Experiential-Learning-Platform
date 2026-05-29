# Task 3: Graph Database Modeling (Bonus)

## Why a graph model?

The Experiential Learning Platform (Task 1) stores **what** happened in MySQL tables (`members`, `board_cards`, `board_columns`). Experiential learning is inherently **relational**: students visit places, progress through stages, receive teacher feedback, and develop skills over time. A property graph (e.g. Neo4j) makes paths such as *student → activity → location → skill* first-class, which supports discovery questions that are awkward in SQL.

## Nodes vs relationships

| Graph element | Examples | What it captures |
|---------------|----------|------------------|
| **Node** | `Student`, `Teacher`, `Activity`, `Location` | Entities with attributes (name, email, title, date, coordinates) |
| **Node** | `School`, `Class`, `Skill`, `WorkflowStage` | Shared context reused across many students |
| **Node** | `Media` | Optional evidence (photos) linked to an activity |
| **Relationship** | `PARTICIPATED_IN`, `LOCATED_AT`, `DEVELOPS` | **Context**: who did what, where, and what was learned |
| **Relationship** | `ADVISES`, `AT_STAGE`, `RECEIVED_FEEDBACK` | **Process**: advising, Kanban stage, teacher review |
| **Relationship** | `ENROLLED_IN`, `BELONGS_TO` | **Organisation**: school / class structure |

**Rule of thumb:** if you would JOIN two tables to answer “how are these connected?”, that connection is often an **edge**. If you would store a row with its own lifecycle, it is usually a **node**.

## Schema diagram

See the [README — Task 3 section](../README.md#task-3-graph-database-modeling-bonus) for the rendered Mermaid diagram.

## Example Cypher queries

### 1. Students who developed a skill at a specific location

```cypher
MATCH (s:Student)-[:PARTICIPATED_IN]->(a:Activity)-[:LOCATED_AT]->(l:Location {name: $locationName})
MATCH (a)-[d:DEVELOPS]->(sk:Skill {name: $skillName})
RETURN s.name AS student, a.title AS activity, l.name AS location, d.level AS proficiency
ORDER BY a.activityDate DESC;
```

### 2. Cross-student insight: popular field-trip locations for a class

```cypher
MATCH (c:Class {name: $className})<-[:ENROLLED_IN]-(s:Student)-[:PARTICIPATED_IN]->(a:Activity)-[:LOCATED_AT]->(l:Location)
RETURN l.name AS location, count(DISTINCT s) AS studentCount, collect(DISTINCT a.title)[0..5] AS sampleActivities
ORDER BY studentCount DESC
LIMIT 10;
```

### 3. Teacher feedback path (bonus)

```cypher
MATCH (t:Teacher)-[f:GAVE_FEEDBACK]->(a:Activity)<-[:PARTICIPATED_IN]-(s:Student)
WHERE t.id = $teacherId AND f.createdAt >= date($since)
RETURN s.name AS student, a.title AS activity, f.text AS feedback
ORDER BY f.createdAt DESC;
```

## Mapping from MySQL (Task 1)

| MySQL | Graph |
|-------|-------|
| `members` (student) | `(:Student)` |
| `members` (teacher) | `(:Teacher)` |
| `members.school`, `class_name` | `(:School)`, `(:Class)` + `ENROLLED_IN` |
| `members.advisor_teacher_id` | `(:Teacher)-[:ADVISES]->(:Student)` |
| `board_columns` | `(:WorkflowStage)` + `(:Student)-[:OWNS]->(:Board)-[:HAS_COLUMN]->(:WorkflowStage)` |
| `board_cards` | `(:Activity)` + `PARTICIPATED_IN`, `AT_STAGE` |
| `board_cards.location` | `(:Location)` + `LOCATED_AT` |
| `board_cards.activity_date` | property `activityDate` on `Activity` |
| `board_cards.feedback` | `(:Teacher)-[:GAVE_FEEDBACK]->(:Activity)` |
| `card_images` | `(:Media)` + `(:Activity)-[:HAS_MEDIA]->(:Media)` |
| Inferred from titles/descriptions | `(:Skill)` + `DEVELOPS` (manual or NLP tag) |

No GraphDB deployment is required for this assignment; this document is a conceptual proposal only.
