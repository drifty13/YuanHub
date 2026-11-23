package com.lhs.share.hub.controller.report

import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.service.report.FeedbackCategoryService
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 可供公开读取的反馈专区元数据。 */
@Tag(name = "Feedback Spaces", description = "反馈专区元数据")
@RestController
@RequestMapping("/v1/reports/public")
class PublicFeedbackController(
    private val categories: FeedbackCategoryService,
) {
    @GetMapping("/spaces")
    fun spaces(): ApiResult<List<FeedbackSpace>> = success(categories.spaces().filter { it.active })

    @GetMapping("/spaces/{id}")
    fun space(@PathVariable id: String): ApiResult<FeedbackSpace> = success(categories.requireSpace(id))
}
