package com.lhs.share.hub.service.stronghold

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.StrongholdRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Service
class StrongholdRecordService(
    private val accounts: SubAccountRepository,
    private val records: StrongholdRecordRepository,
    private val mapper: ObjectMapper,
    private val events: AccountEventService,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
) {
    fun get(userId: String, accountId: String): ObjectNode {
        requireAccount(userId, accountId)
        val stored = records.findByUserIdAndAccountId(userId, accountId)
        val payload = stored?.let { mapper.readTree(it.payloadJson) as ObjectNode } ?: empty()
        return payload.put("account_id", accountId).put("revision", stored?.revision ?: 0)
    }

    fun put(userId: String, accountId: String, request: ObjectNode): ObjectNode {
        val account = requireAccount(userId, accountId)
        if (request.fieldNames().asSequence().any { it !in FIELDS }) invalid("unknown field")
        if (integer(request.path("schema_version"), "schema_version") != 1L) invalid("schema_version")
        val revision = integer(request.path("expected_revision"), "expected_revision")
        if (revision !in 0..9_007_199_254_740_990L) invalid("expected_revision")

        val levels = request.path("levels")
        if (!levels.isObject) invalid("levels")
        levels.fields().forEach { (city, buildings) ->
            if (city !in SPECIALTIES || !buildings.isObject) invalid("levels.$city")
            buildings.fields().forEach { (name, level) ->
                if (!validBuilding(city, name) || integer(level, "levels.$city.$name") !in 1..10) invalid("levels.$city.$name")
            }
        }
        val active = request.path("active")
        if (!active.isObject) invalid("active")
        active.fields().forEach { (city, name) ->
            if (city !in SPECIALTIES || !name.isTextual || !validBuilding(city, name.textValue())) invalid("active.$city")
        }
        val content = request.deepCopy().also { it.remove("expected_revision") }
        val saved = try {
            checkNotNull(
                transaction.execute {
                    // Share the account fence with deletion/game changes so a late write cannot recreate orphaned data.
                    if (!accounts.fenceRecruitmentWrite(userId, accountId, account.game)) conflict()
                    records.replace(userId, accountId, revision, content.toString(), Instant.now()) ?: conflict()
                },
            )
        } catch (_: DuplicateKeyException) {
            conflict()
        } catch (error: RuntimeException) {
            if (RecruitmentService.isWriteConflict(error)) conflict()
            throw error
        }
        events.publishChange(userId, accountId, "stronghold", mapOf("revision" to saved.revision))
        return content.put("account_id", accountId).put("revision", saved.revision)
    }

    private fun requireAccount(userId: String, accountId: String) = accounts.findByUserIdAndAccountId(userId, accountId)
        ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "账号不存在")

    private fun integer(node: JsonNode, field: String): Long {
        if (!node.isIntegralNumber || !node.canConvertToLong()) invalid(field)
        return node.longValue()
    }

    private fun validBuilding(city: String, name: String) = name == "商行" || name == "书馆" || name == SPECIALTIES[city]

    private fun empty() = mapper.createObjectNode().apply {
        put("schema_version", 1)
        putObject("levels")
        putObject("active")
    }

    private fun invalid(field: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_stronghold_record", "据点记录无效：$field", fieldPath = field)

    private fun conflict(): Nothing = throw OperatorApiException(HttpStatus.CONFLICT, "stronghold_revision_conflict", "据点记录已更新，请重新读取")

    private companion object {
        val FIELDS = setOf("schema_version", "expected_revision", "levels", "active")
        val SPECIALTIES = mapOf(
            "广陵" to "歌楼", "雒阳" to "驿馆", "东阳" to "歌楼", "江都" to "驿馆",
            "偃师" to "歌楼", "寿春" to "歌楼", "丹阳" to "驿馆", "彭城" to "驿馆",
            "琅琊" to "歌楼", "下邳" to "驿馆", "郿坞" to "歌楼", "涿郡" to "织户",
        )
    }
}
