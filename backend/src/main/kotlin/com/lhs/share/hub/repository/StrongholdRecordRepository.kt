package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.StrongholdRecord
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

interface StrongholdRecordRepository : MongoRepository<StrongholdRecord, String>, StrongholdRecordRepositoryCustom {
    fun findByUserIdAndAccountId(userId: String, accountId: String): StrongholdRecord?
    fun deleteAllByUserIdAndAccountId(userId: String, accountId: String)
}

interface StrongholdRecordRepositoryCustom {
    fun replace(userId: String, accountId: String, expected: Long, payload: String, now: Instant): StrongholdRecord?
}

class StrongholdRecordRepositoryImpl(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) :
    StrongholdRecordRepositoryCustom {
    override fun replace(userId: String, accountId: String, expected: Long, payload: String, now: Instant): StrongholdRecord? =
        template.findAndModify(
            Query.query(
                Criteria.where("_id").`is`("$userId:$accountId").and("userId").`is`(userId)
                    .and("accountId").`is`(accountId).and("revision").`is`(expected),
            ),
            Update().set("userId", userId).set("accountId", accountId).set("payloadJson", payload)
                .set("revision", expected + 1).set("updatedAt", now),
            FindAndModifyOptions.options().upsert(expected == 0L).returnNew(true),
            StrongholdRecord::class.java,
        )
}
