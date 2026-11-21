package com.lhs.share.hub.controller.inventory.response

import java.time.Instant

data class DrawResourceContextResponse(
    val accountId: String,
    val game: String,
    val inventoryRevision: Long,
    val balances: Map<String, Long?>,
    val earliestBackfillAt: Map<String, Instant?>,
)
