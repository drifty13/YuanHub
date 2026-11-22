package com.lhs.share.hub.controller.stronghold

import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.stronghold.StrongholdRecordService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/stronghold")
class StrongholdRecordController(private val service: StrongholdRecordService, private val helper: AuthenticationHelper) {
    @GetMapping
    fun get(@RequestParam("account_id") accountId: String) = success(service.get(helper.requireUserId(), accountId))

    @PutMapping
    fun put(@RequestParam("account_id") accountId: String, @RequestBody request: ObjectNode) =
        success(service.put(helper.requireUserId(), accountId, request))
}
