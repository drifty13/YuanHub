package com.lhs.share.hub.service.stronghold

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.StrongholdRecordRepository
import com.lhs.share.hub.repository.StrongholdRecordRepositoryImpl
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.SubAccountRepositoryImpl
import com.lhs.share.hub.repository.entity.StrongholdRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.testinfra.TestMongo
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory
import org.springframework.data.repository.core.support.RepositoryComposition.RepositoryFragments
import org.springframework.http.HttpStatus
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class StrongholdRecordMongoTest {
    private val database = TestMongo.database("stronghold")
    private val client = TestMongo.client()
    private val factory = SimpleMongoClientDatabaseFactory(client, database)
    private val mongo = MongoTemplate(factory)
    private val transaction = TransactionTemplate(MongoTransactionManager(factory))
    private val mapper = jacksonObjectMapper()
    private val events = mockk<AccountEventService>(relaxed = true)
    private val repositories = MongoRepositoryFactory(mongo)
    private val records = repositories.getRepository(
        StrongholdRecordRepository::class.java,
        RepositoryFragments.just(StrongholdRecordRepositoryImpl(mongo)),
    )
    private val accounts = repositories.getRepository(
        SubAccountRepository::class.java,
        RepositoryFragments.just(SubAccountRepositoryImpl(mongo)),
    )
    private val service = StrongholdRecordService(accounts, records, mapper, events, transaction)
    private val lifecycle = SubAccountService(
        accountRepository = accounts, inventoryCurrentRepository = mockk(relaxed = true), inventoryRecordRepository = mockk(relaxed = true),
        inventoryDeletedRecordRepository = mockk(relaxed = true), favoriteRepository = mockk(relaxed = true),
        operatorCurrentRepository = mockk(relaxed = true), operatorRecordRepository = mockk(relaxed = true),
        operatorCorrectionRecordRepository = mockk(relaxed = true), operatorV3ImportRecordRepository = mockk(relaxed = true),
        operatorScanReviewRepository = mockk(relaxed = true), tokenService = mockk(relaxed = true), transactionTemplate = transaction,
        strongholdRecords = records,
    )

    @BeforeEach
    fun setup() {
        listOf(SubAccount::class.java, StrongholdRecord::class.java).forEach { type ->
            mongo.createCollection(type)
            MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(type).forEach {
                mongo.indexOps(type).createIndex(it)
            }
        }
        accounts.save(SubAccount(userId = "owner", accountId = "a", name = "大号", game = "代号鸢"))
        accounts.save(SubAccount(userId = "owner", accountId = "b", name = "小号", game = "如鸢"))
        accounts.save(SubAccount(userId = "other", accountId = "a", name = "大号", game = "如鸢"))
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `empty reads are side effect free`() {
        repeat(2) {
            val response = service.get("owner", "a")
            assertEquals("a", response.path("account_id").asText())
            assertEquals(0L, response.path("revision").asLong())
            assertEquals(1, response.path("schema_version").asInt())
            assertEquals(mapper.createObjectNode(), response.path("levels"))
            assertEquals(mapper.createObjectNode(), response.path("active"))
        }
        assertEquals(0L, records.count())
    }

    @Test
    fun `concurrent creates and updates have one winner and one revision conflict`() {
        val pool = Executors.newFixedThreadPool(2)
        try {
            for (revision in 0..1) {
                val barrier = CyclicBarrier(2)
                val writes = (1..2).map { level ->
                    Callable {
                        barrier.await(5, TimeUnit.SECONDS)
                        try {
                            service.put("owner", "a", body(level, revision))
                            "saved"
                        } catch (e: OperatorApiException) {
                            assertEquals(HttpStatus.CONFLICT, e.status)
                            e.code
                        }
                    }
                }
                val results = pool.invokeAll(writes).map { it.get() }
                assertEquals(listOf("saved", "stronghold_revision_conflict"), results.sorted())
                assertEquals(revision + 1, service.get("owner", "a").path("revision").asInt())
            }
        } finally {
            pool.shutdownNow()
        }
        val latest = service.get("owner", "a")
        val stale = assertThrows(OperatorApiException::class.java) { service.put("owner", "a", body(9, 1)) }
        assertEquals("stronghold_revision_conflict", stale.code)
        assertEquals(latest, service.get("owner", "a"))
        assertEquals(1L, records.count())
        verify(exactly = 1) { events.publishChange("owner", "a", "stronghold", mapOf("revision" to 2L)) }
    }

    @Test
    fun `deletion fences an already authorized create and only clears its owner and account`() {
        val first = service.put("owner", "a", body(3))
        val second = service.put("owner", "b", body(7))
        val other = service.put("other", "a", body(10))
        assertEquals(first, service.get("owner", "a"))
        assertEquals(second, service.get("owner", "b"))
        assertEquals(other, service.get("other", "a"))
        // Delete after the pending writer has read the account, before it can enter its transaction.
        val lateAccounts = object : SubAccountRepository by accounts {
            override fun findByUserIdAndAccountId(userId: String, accountId: String): SubAccount? =
                accounts.findByUserIdAndAccountId(userId, accountId).also { lifecycle.delete(userId, accountId) }
        }
        val late = StrongholdRecordService(lateAccounts, records, mapper, events, transaction)
        val conflict = assertThrows(OperatorApiException::class.java) { late.put("owner", "a", body(4)) }
        assertEquals("stronghold_revision_conflict", conflict.code)
        assertNull(records.findByUserIdAndAccountId("owner", "a"))
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(OperatorApiException::class.java) { service.put("owner", "a", body(1)) }.status)
        assertEquals(second, service.get("owner", "b"))
        assertEquals(other, service.get("other", "a"))
        assertEquals(2L, records.count())
    }

    private fun body(level: Int, revision: Int = 0) = mapper.readTree(
        """{"schema_version":1,"expected_revision":$revision,"levels":{"广陵":{"歌楼":$level}},"active":{"广陵":"歌楼"}}""",
    ) as ObjectNode
}
