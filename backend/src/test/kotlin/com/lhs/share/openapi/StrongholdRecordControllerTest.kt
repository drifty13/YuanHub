package com.lhs.share.openapi

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.OperatorExceptionHandler
import com.lhs.share.hub.controller.stronghold.StrongholdRecordController
import com.lhs.share.hub.service.operator.OperatorApiException
import com.lhs.share.hub.service.stronghold.StrongholdRecordService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException

class StrongholdRecordControllerTest {
    private val service = mockk<StrongholdRecordService>()
    private val helper = mockk<AuthenticationHelper>()
    private val mapper = jacksonObjectMapper()
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(StrongholdRecordController(service, helper))
            .setControllerAdvice(OperatorExceptionHandler())
            .setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "owner"
    }

    @Test
    fun `GET and PUT route through the authenticated owner and explicit account`() {
        val response = mapper.readTree("""{"account_id":"a","revision":1,"schema_version":1,"levels":{},"active":{}}""") as ObjectNode
        every { service.get("owner", "a") } returns response
        every { service.put("owner", "a", any()) } returns response
        mvc.perform(get("/v1/stronghold").param("account_id", "a"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.account_id").value("a"))
        mvc.perform(
            put("/v1/stronghold").param("account_id", "a")
                .contentType(MediaType.APPLICATION_JSON).content("""{"expected_revision":0}"""),
        )
            .andExpect(status().isOk).andExpect(jsonPath("$.data.revision").value(1))
        verify { service.put("owner", "a", match { it.path("expected_revision").asLong() == 0L }) }
        mvc.perform(get("/v1/stronghold")).andExpect(status().isBadRequest)
    }

    @Test
    fun `account denial and revision conflict retain explicit client errors`() {
        every { service.get("owner", "other") } throws OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "missing")
        every { service.put("owner", "a", any()) } throws OperatorApiException(
            HttpStatus.CONFLICT,
            "stronghold_revision_conflict",
            "reload",
        )
        mvc.perform(get("/v1/stronghold").param("account_id", "other")).andExpect(status().isNotFound)
        mvc.perform(
            put("/v1/stronghold").param("account_id", "a")
                .contentType(MediaType.APPLICATION_JSON).content("{}"),
        )
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("stronghold_revision_conflict"))
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        mvc.perform(get("/v1/stronghold").param("account_id", "a")).andExpect(status().isUnauthorized)
        verify(exactly = 0) { service.get("owner", "a") }
    }
}
