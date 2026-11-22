package com.lhs.share.hub.service.stronghold

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.StrongholdRecordRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.operator.OperatorApiException
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class StrongholdRecordServiceTest {
    private val mapper = jacksonObjectMapper()
    private val accounts = mockk<SubAccountRepository>()
    private val records = mockk<StrongholdRecordRepository>()
    private val events = mockk<AccountEventService>()
    private val service = StrongholdRecordService(accounts, records, mapper, events, mockk())

    @Test
    fun `foreign reads and writes are denied before record access`() {
        every { accounts.findByUserIdAndAccountId("stranger", "a") } returns null
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(OperatorApiException::class.java) { service.get("stranger", "a") }.status)
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows(OperatorApiException::class.java) { service.put("stranger", "a", body()) }.status,
        )
        verify { records wasNot Called }
        verify { events wasNot Called }
    }

    @Test
    fun `invalid fields cities buildings levels and revisions never reach storage`() {
        every { accounts.findByUserIdAndAccountId("owner", "a") } returns SubAccount(userId = "owner", accountId = "a", name = "大号")
        val invalid = listOf(
            body().put("unknown", true), body().put("schema_version", "1"), body().put("schema_version", 4_294_967_297L),
            body().put("expected_revision", -1), body().put("expected_revision", 1.5),
            body().put("expected_revision", 9_007_199_254_740_991L),
            body().also { it.remove("levels") }, body().also { it.putArray("active") },
            body().also { it.putObject("levels").putObject("洛阳") }, body().also { it.putObject("levels").put("广陵", 1) },
            body().also { it.putObject("levels").putObject("广陵").put("驿馆", 1) },
            body().also { it.putObject("levels").putObject("广陵").put("书馆", 0) },
            body().also { it.putObject("levels").putObject("广陵").put("书馆", 11) },
            body().also { it.putObject("levels").putObject("广陵").put("书馆", 1.1) },
            body().also { it.putObject("levels").putObject("广陵").put("书馆", "1") },
            body().also { it.putObject("active").put("涿郡", "歌楼") }, body().also { it.putObject("active").put("未知", "商行") },
        )
        invalid.forEach { request ->
            val error = assertThrows(OperatorApiException::class.java) { service.put("owner", "a", request) }
            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
        }
        verify { records wasNot Called }
        verify { events wasNot Called }
        verify(exactly = 0) { accounts.fenceRecruitmentWrite(any(), any(), any()) }
    }

    private fun body() = mapper.readTree("""{"schema_version":1,"expected_revision":0,"levels":{},"active":{}}""") as ObjectNode
}
