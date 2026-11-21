// 从 backend/ 运行。连接串需选择 HubBackend，APPLY=1 使用 MongoDB 事务。
//   APPLY=0 mongosh "$SHARE_MONGO_HUB_URI" --quiet --file scripts/migrations/20261121-feedback-merge-spaces-into-yuanhub.js
//   APPLY=1 mongosh "$SHARE_MONGO_HUB_URI" --quiet --file scripts/migrations/20261121-feedback-merge-spaces-into-yuanhub.js
const MAIN = "yuanhub";
const MIGRATION = "migration:20261121-feedback-merge-spaces-into-yuanhub";
if (db.getName() !== "HubBackend") throw new Error("连接串必须选择 HubBackend");

function mergeSpaces(database, apply) {
  const catalog = database.feedback_category_catalog.findOne({ _id: "feedback" });
  const categories = catalog?.categories ?? [];
  const spaces = catalog?.spaces ?? [];
  // Spring Data 将嵌套 FeedbackSpace.id 存为 _id。
  const spaceId = (space) => space._id ?? space.id;
  const moved = categories.filter((category) => category.spaceId !== MAIN);
  const disabled = spaces.filter((space) => spaceId(space) !== MAIN && space.active !== false);

  if (!apply) {
    const rows = new Map();
    function row(id) {
      if (!rows.has(id)) rows.set(id, { spaceId: id, categoryCount: 0, ticketCount: 0, movedKeys: [] });
      return rows.get(id);
    }
    row(MAIN);
    for (const space of spaces) row(spaceId(space));
    for (const category of categories) {
      const entry = row(category.spaceId ?? MAIN);
      entry.categoryCount++;
      if (category.spaceId !== MAIN) entry.movedKeys.push(category.key);
    }
    const counts = database.feedback_tickets.aggregate([
      { $group: { _id: { $ifNull: ["$spaceId", MAIN] }, count: { $sum: 1 } } },
    ]).toArray();
    for (const count of counts) row(count._id).ticketCount = count.count;
    for (const entry of rows.values()) printjson(entry);
    return;
  }

  if (moved.length || disabled.length) {
    const fields = {};
    categories.forEach((category, index) => {
      if (category.spaceId !== MAIN) fields[`categories.${index}.spaceId`] = MAIN;
    });
    spaces.forEach((space, index) => {
      if (spaceId(space) !== MAIN && space.active !== false) fields[`spaces.${index}.active`] = false;
    });
    const update = { $set: fields };
    if (catalog.version == null) fields.version = NumberLong(0); // Spring 首次持久化的版本。
    else update.$inc = { version: NumberLong(1) };
    const changed = database.feedback_category_catalog.updateOne(
      { _id: catalog._id, version: catalog.version ?? null },
      update,
    );
    if (changed.matchedCount !== 1) throw new Error("反馈目录版本已变化，请重新预览");
    function auditSnapshot(merged) {
      const snapshot = {
        categories: moved.map((c) => ({ key: c.key, spaceId: merged ? MAIN : c.spaceId ?? null })),
        spaces: disabled.map((s) => ({ id: spaceId(s), active: merged ? false : s.active ?? true })),
      };
      if (disabled.length) {
        snapshot.feedbackSpaceLabel = disabled.map((s) => s.label).join("、");
        snapshot.feedbackSpaceActive = !merged;
      }
      return snapshot;
    }
    database.admin_audit_logs.insertOne({
      actorUserId: MIGRATION,
      action: "FEEDBACK_SPACE_UPDATED",
      targetResource: "feedback_category_catalog/feedback",
      before: auditSnapshot(false),
      after: auditSnapshot(true),
      occurredAt: new Date(),
    });
  }
  database.feedback_tickets.updateMany(
    { spaceId: { $exists: true, $nin: [null, MAIN] } },
    { $set: { spaceId: MAIN } },
  );
}

if (process.env.APPLY === "1") {
  const session = db.getMongo().startSession();
  try {
    session.withTransaction(() => mergeSpaces(session.getDatabase("HubBackend"), true), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    session.endSession();
  }
  print("反馈专区迁移事务已提交。");
} else {
  mergeSpaces(db, false);
}
