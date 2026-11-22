package com.lhs.share.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.web.filter.ShallowEtagHeaderFilter
import org.springframework.web.servlet.DispatcherServlet
import java.io.InputStream

@Configuration
class PublicCatalogCacheConfig {
    @Bean
    fun publicCatalogEtagFilter(): FilterRegistrationBean<ShallowEtagHeaderFilter> {
        val filter = object : ShallowEtagHeaderFilter() {
            override fun shouldNotFilter(request: HttpServletRequest): Boolean = !HttpMethod.GET.matches(request.method)

            override fun isEligibleForEtag(
                request: HttpServletRequest,
                response: HttpServletResponse,
                responseStatusCode: Int,
                inputStream: InputStream,
            ): Boolean {
                // Legacy exception handlers can return an error body with HTTP 200.
                val unhandledException = request.getAttribute(DispatcherServlet.EXCEPTION_ATTRIBUTE)
                if (responseStatusCode != HttpServletResponse.SC_OK || unhandledException != null) {
                    return false
                }
                if (!super.isEligibleForEtag(request, response, responseStatusCode, inputStream)) return false
                response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache")
                return true
            }
        }
        filter.setWriteWeakETag(true)
        return FilterRegistrationBean<ShallowEtagHeaderFilter>(filter).apply {
            addUrlPatterns("/v1/operator/catalog", "/v1/inventory/catalog")
            // Run inside Security's response wrapper so it sees the cache header before commit.
            order = Ordered.LOWEST_PRECEDENCE
        }
    }
}
