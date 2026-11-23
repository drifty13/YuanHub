// 从 backend/ 运行。默认只预览，APPLY=1 在同一事务内迁移并记录审计。
// mongosh "$SHARE_MONGO_HUB_URI" --quiet --file scripts/migrations/20261123-feedback-operator-workflow.js
const MIGRATION = "migration:20261123-feedback-operator-workflow";
if (db.getName() !== "HubBackend") throw new Error("连接串必须选择 HubBackend");

function migrate(database, apply) {
  const now = new Date();
  const tickets = database.feedback_tickets;
  const grants = database.feedback_access_grants;
  let ticketCount = 0;
  let accountCount = 0;
  tickets.find({ workflowStage: "DEV_HANDOFF" }, { _id: 1, operatorAssigneeUserId: 1 }).forEach(ticket => {
    ticketCount++;
    const owner = ticket.operatorAssigneeUserId || null;
    const stage = owner === null ? "UNASSIGNED" : "PROCESSING";
    if (!apply) {
      printjson({ ticketId: ticket._id, owner, before: "DEV_HANDOFF", after: stage });
      return;
    }
    const fields = { workflowStage: stage };
    if (owner === null) {
      fields.operatorAssigneeUserId = null;
      fields.operatorAssignedAt = null;
    }
    const result = tickets.updateOne({ _id: ticket._id, workflowStage: "DEV_HANDOFF" }, { $set: fields });
    if (result.matchedCount !== 1) throw new Error("工单已变化：" + ticket._id);
    database.feedback_workflow_events.insertOne({
      ticketId: ticket._id, actorUserId: MIGRATION, action: "MIGRATE_WORKFLOW",
      note: owner === null ? "原转程序工单没有运营负责人，移至待接单。" : "原转程序工单移至已接单，保留运营负责人。",
      createdAt: now,
    });
  });

  const pending = { $or: [{ feedbackRoles: "DEVELOPER" }, { developerAreas: { $exists: true } }] };
  grants.find(pending).forEach(grant => {
    accountCount++;
    const before = {
      feedbackRoles: grant.feedbackRoles ?? [],
      operatorAreas: grant.operatorAreas ?? [],
      developerAreas: grant.developerAreas ?? [],
    };
    // 无程序岗位的历史残留板块没有授权效力，清理时不得据此提升权限。
    const convert = before.feedbackRoles.includes("DEVELOPER");
    const after = {
      feedbackRoles: convert ? [...new Set([...before.feedbackRoles.filter(r => r !== "DEVELOPER"), "OPERATOR"])] : before.feedbackRoles,
      operatorAreas: convert ? [...new Set([...before.operatorAreas, ...before.developerAreas])] : before.operatorAreas,
    };
    if (!apply) {
      printjson({ account: grant._id, before, after });
      return;
    }
    const result = grants.updateOne({ _id: grant._id }, {
      $set: { ...after, updatedAt: now, updatedBy: MIGRATION }, $unset: { developerAreas: "" },
    });
    if (result.matchedCount !== 1) throw new Error("授权已变化：" + grant._id);
    database.admin_audit_logs.insertOne({
      actorUserId: MIGRATION, action: "FEEDBACK_ACCESS_UPDATED", targetUserId: grant._id,
      targetResource: "feedback_access_grants/" + grant._id, before, after, occurredAt: now,
    });
  });
  if (!apply) printjson({ ticketCount, accountCount });
}

if (process.env.APPLY === "1") {
  const session = db.getMongo().startSession();
  try {
    session.withTransaction(() => migrate(session.getDatabase("HubBackend"), true), {
      readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
    });
  } finally {
    session.endSession();
  }
  print("反馈流转及运营授权迁移事务已提交。");
} else {
  migrate(db, false);
}
