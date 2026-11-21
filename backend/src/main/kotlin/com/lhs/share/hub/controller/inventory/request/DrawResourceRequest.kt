package com.lhs.share.hub.controller.inventory.request

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer
import com.lhs.share.hub.service.inventory.InventoryApiException
import org.springframework.http.HttpStatus
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

data class DrawResourceRequest(
    val accountId: String,
    val game: String,
    val operationId: String,
    val expectedInventoryRevision: Long,
    val action: String,
    val ticketId: String,
    val quantity: Long,
    val channel: String,
    // An omitted time must serialize exactly like the original eight-field retry identity.
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    @get:JsonSerialize(using = ToStringSerializer::class)
    val occurredAt: Instant? = null,
) {
    companion object {
        private val timestamp = Regex("""\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:[Zz]|[+-]\d{2}:\d{2})""")

        fun parse(body: JsonNode): DrawResourceRequest {
            val fields =
                setOf("account_id", "game", "operation_id", "expected_inventory_revision", "action", "ticket_id", "quantity", "channel")
            val expected = if (body.has("occurred_at")) fields + "occurred_at" else fields
            if (!body.isObject || body.fieldNames().asSequence().toSet() != expected) invalid()
            fun text(key: String): String {
                val node = body[key]
                if (node == null || !node.isTextual || node.textValue().isBlank() || node.textValue().length > 128) invalid()
                return node.textValue()
            }
            fun number(key: String): Long {
                val node = body[key]
                if (node == null || !node.isIntegralNumber || !node.canConvertToLong()) invalid()
                return node.longValue()
            }
            val action = text("action")
            val occurredAt = body["occurred_at"]?.let {
                if (action != "use" && action != "exchange") invalid("仅使用和兑换支持补录时间")
                val value = it.textValue().orEmpty()
                if (!timestamp.matches(value)) invalid("发生时间须为带时区的 RFC 3339 日期时间")
                val instant = try {
                    OffsetDateTime.parse(value).toInstant()
                } catch (_: DateTimeParseException) {
                    invalid("发生日期或时间无效")
                }
                if (instant.isAfter(Instant.now())) invalid("发生时间不能晚于现在")
                instant.truncatedTo(ChronoUnit.MILLIS)
            }
            return DrawResourceRequest(
                text("account_id"),
                text("game"),
                text("operation_id"),
                number("expected_inventory_revision"),
                action,
                text("ticket_id"),
                number("quantity"),
                text("channel"),
                occurredAt,
            )
        }

        private fun invalid(message: String = "请完整填写有效的资源操作，数量和版本必须为整数"): Nothing = throw InventoryApiException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "draw_resource_invalid_request",
            message,
        )
    }
}
