package com.lhs.share.service.jwt

import cn.hutool.jwt.JWT
import cn.hutool.jwt.JWTHeader
import cn.hutool.jwt.signers.JWTSignerUtil
import com.lhs.share.config.external.ShareProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Base64

class JwtServiceTest {
    private val properties = ShareProperties().apply {
        jwt.secret = "test-secret-test-secret-test-secret-test-secret"
    }
    private val jwtService = JwtService(properties)

    @Test
    fun `auth token 签发与验证`() {
        val token = jwtService.issueAuthToken("user-1", null, emptyList())

        val parsed = jwtService.verifyAndParseAuthToken(token.value)

        assertEquals("user-1", parsed.subject)
        assertEquals(true, parsed.isAuthenticated)
    }

    @Test
    fun `refresh token 签发与验证`() {
        val token = jwtService.issueRefreshToken("user-1", null)

        val parsed = jwtService.verifyAndParseRefreshToken(token.value)

        assertEquals("user-1", parsed.subject)
    }

    @Test
    fun `unsigned or malformed headers fail before expiry is checked`() {
        // Frozen auth and refresh payloads for the fixture session, both expired at epoch + 1s.
        val auth = "eyJzdWIiOiJmaXh0dXJlIiwianRpIjoiZml4dHVyZSIsImlhdCI6MCwiZXhwIjoxMDAwLCJuYmYiOjAsInR5cCI6ImF1dGgifQ"
        val refresh = "eyJzdWIiOiJmaXh0dXJlIiwianRpIjoiZml4dHVyZSIsImlhdCI6MCwiZXhwIjoxMDAwLCJuYmYiOjAsInR5cCI6InJlZnJlc2gifQ"
        val headers = listOf(
            """{"typ":"JWT","alg":"none"}""",
            """{"typ":"JWT","alg":"None"}""",
            """{"typ":"JWT","alg":"NONE"}""",
            """{"typ":"JWT","alg":""}""",
            """{"typ":"JWT"}""",
            "invalid header",
        )
        for (header in headers) {
            val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(header.toByteArray())
            assertThrows(JwtInvalidException::class.java, { jwtService.verifyAndParseAuthToken("$encoded.$auth.") }, header)
            assertThrows(JwtInvalidException::class.java, { jwtService.verifyAndParseRefreshToken("$encoded.$refresh.") }, header)
        }
    }

    @Test
    fun `valid HS512 signatures are rejected for both token types`() {
        val signer = JWTSignerUtil.hs512(properties.jwt.secret.toByteArray())
        fun signHs512(value: String) = JWT.of(value).setHeader(JWTHeader.ALGORITHM, "HS512").sign(signer)

        val auth = signHs512(jwtService.issueAuthToken("fixture", "fixture", emptyList()).value)
        val refresh = signHs512(jwtService.issueRefreshToken("fixture", "fixture").value)
        assertThrows(JwtInvalidException::class.java) { jwtService.verifyAndParseAuthToken(auth) }
        assertThrows(JwtInvalidException::class.java) { jwtService.verifyAndParseRefreshToken(refresh) }
    }

    @Test
    fun `格式错误的 refresh token 抛出 JwtInvalidException`() {
        assertThrows(JwtInvalidException::class.java) {
            jwtService.verifyAndParseRefreshToken("invalid")
        }
    }

    @Test
    fun `伪造 token 抛出 JwtInvalidException`() {
        val token = jwtService.issueAuthToken("user-1", null, emptyList())
        val tampered = token.value.dropLast(4) + "xxxx"

        assertThrows(JwtInvalidException::class.java) {
            jwtService.verifyAndParseAuthToken(tampered)
        }
    }

    @Test
    fun `过期 token 抛出 JwtExpiredException`() {
        val now = Instant.now().minusSeconds(7200)
        val expired = JwtAuthToken(
            "user-1",
            null,
            now,
            now.plusSeconds(1),
            now,
            emptyList(),
            properties.jwt.secret.toByteArray(),
        )

        assertThrows(JwtExpiredException::class.java) {
            jwtService.verifyAndParseAuthToken(expired.value)
        }
    }
}
