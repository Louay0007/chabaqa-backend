import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ContentManagementService } from './content-management.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { ContentManagementAccess } from '../common/decorators/admin-roles.decorator';
import {
  ContentFiltersDto,
  CourseFiltersDto,
  ChallengeFiltersDto,
  EventFiltersDto,
  PostFiltersDto,
  PaginationDto,
  SubmissionFiltersDto,
} from './dto/content-filters.dto';
import {
  ApproveContentDto,
  RejectContentDto,
  SuspendContentDto,
  BulkContentActionDto,
  ApproveSubmissionDto,
  RejectSubmissionDto,
  MessageAttendeesDto,
} from './dto/content-approval.dto';
import { AdminRequest } from '../common/interfaces/admin-interfaces';

@ApiTags('Admin - Content Management')
@ApiBearerAuth()
@Controller('admin/content')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@ContentManagementAccess()
export class ContentManagementController {
  constructor(private readonly contentManagementService: ContentManagementService) {}

  // ==================== SUMMARY ====================

  @Get('summary')
  @ApiOperation({
    summary: 'Get Content Summary',
    description: 'Get summary statistics for all content types',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Summary retrieved successfully',
  })
  async getContentSummary(@Req() req: ExpressRequest & AdminRequest) {
    const result = await this.contentManagementService.getContentSummary(req.user.id);
    return {
      success: true,
      data: result,
    };
  }

  // ==================== COURSES ====================

  @Get('courses')
  @ApiOperation({
    summary: 'Get Courses',
    description: 'Retrieve courses with advanced filtering, search, and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Courses retrieved successfully',
  })
  async getCourses(
    @Query() filters: CourseFiltersDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    const result = await this.contentManagementService.getCourses(filters, req.user.id);
    return {
      success: true,
      message: 'Courses retrieved successfully',
      data: result,
    };
  }

  @Get('courses/:id')
  @ApiOperation({
    summary: 'Get Course by ID',
    description: 'Retrieve detailed information about a specific course',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Course retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Course not found',
  })
  async getCourseById(@Param('id') id: string) {
    const result = await this.contentManagementService.getCourseById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Put('courses/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve Course',
    description: 'Approve a course for publication',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Course approved successfully',
  })
  async approveCourse(
    @Param('id') id: string,
    @Body() dto: ApproveContentDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.approveCourse(id, req.user.id);
    return {
      success: true,
      message: 'Course approved successfully',
    };
  }

  @Put('courses/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject Course',
    description: 'Reject a course with a reason',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Course rejected successfully',
  })
  async rejectCourse(
    @Param('id') id: string,
    @Body() dto: RejectContentDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.rejectCourse(id, dto, req.user.id);
    return {
      success: true,
      message: 'Course rejected successfully',
    };
  }

  @Put('courses/:id/feature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Feature/Unfeature Course',
    description: 'Toggle featured status for a course',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Course featured status updated',
  })
  async featureCourse(
    @Param('id') id: string,
    @Body('featured') featured: boolean,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.featureCourse(id, featured, req.user.id);
    return {
      success: true,
      message: featured ? 'Course featured successfully' : 'Course unfeatured successfully',
    };
  }

  @Put('courses/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend Course',
    description: 'Suspend a course with a reason',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Course suspended successfully',
  })
  async suspendCourse(
    @Param('id') id: string,
    @Body() dto: SuspendContentDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.suspendCourse(id, dto, req.user.id);
    return {
      success: true,
      message: 'Course suspended successfully',
    };
  }

  @Get('courses/:id/enrollments')
  @ApiOperation({
    summary: 'Get Course Enrollments',
    description: 'Get list of students enrolled in a course',
  })
  @ApiParam({ name: 'id', description: 'Course ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Enrollments retrieved successfully',
  })
  async getCourseEnrollments(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.contentManagementService.getCourseEnrollments(id, pagination);
    return {
      success: true,
      data: result,
    };
  }

  @Post('courses/bulk-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk Approve Courses',
    description: 'Approve multiple courses at once',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bulk operation completed',
  })
  async bulkApproveCourses(
    @Body() dto: BulkContentActionDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    const result = await this.contentManagementService.bulkApproveCourses(dto, req.user.id);
    return {
      success: result.success,
      message: `Processed ${result.processed} courses: ${result.succeeded} succeeded, ${result.failed} failed`,
      data: result,
    };
  }

  // ==================== CHALLENGES ====================

  @Get('challenges')
  @ApiOperation({
    summary: 'Get Challenges',
    description: 'Retrieve challenges with advanced filtering, search, and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Challenges retrieved successfully',
  })
  async getChallenges(
    @Query() filters: ChallengeFiltersDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    const result = await this.contentManagementService.getChallenges(filters, req.user.id);
    return {
      success: true,
      message: 'Challenges retrieved successfully',
      data: result,
    };
  }

  @Get('challenges/:id')
  @ApiOperation({
    summary: 'Get Challenge by ID',
    description: 'Retrieve detailed information about a specific challenge',
  })
  @ApiParam({ name: 'id', description: 'Challenge ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Challenge retrieved successfully',
  })
  async getChallengeById(@Param('id') id: string) {
    const result = await this.contentManagementService.getChallengeById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Get('challenges/:id/submissions')
  @ApiOperation({
    summary: 'Get Challenge Submissions',
    description: 'Get all submissions for a challenge',
  })
  @ApiParam({ name: 'id', description: 'Challenge ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Submissions retrieved successfully',
  })
  async getChallengeSubmissions(
    @Param('id') id: string,
    @Query() filters: SubmissionFiltersDto,
  ) {
    const result = await this.contentManagementService.getChallengeSubmissions(id, filters);
    return {
      success: true,
      data: result,
    };
  }

  @Put('challenges/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve Challenge',
    description: 'Approve a challenge for publication',
  })
  async approveChallenge(
    @Param('id') id: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.approveChallenge(id, req.user.id);
    return {
      success: true,
      message: 'Challenge approved successfully',
    };
  }

  @Put('challenges/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject Challenge',
    description: 'Reject a challenge with a reason',
  })
  async rejectChallenge(
    @Param('id') id: string,
    @Body() dto: RejectContentDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.rejectChallenge(id, dto, req.user.id);
    return {
      success: true,
      message: 'Challenge rejected successfully',
    };
  }

  @Put('challenges/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End Challenge Early',
    description: 'End a challenge before its scheduled end date',
  })
  async endChallengeEarly(
    @Param('id') id: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.endChallengeEarly(id, req.user.id);
    return {
      success: true,
      message: 'Challenge ended successfully',
    };
  }

  @Put('challenges/submissions/:submissionId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve Submission',
    description: 'Approve a challenge submission',
  })
  async approveSubmission(
    @Param('submissionId') submissionId: string,
    @Body() dto: ApproveSubmissionDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.approveSubmission(submissionId, dto, req.user.id);
    return {
      success: true,
      message: 'Submission approved successfully',
    };
  }

  @Put('challenges/submissions/:submissionId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject Submission',
    description: 'Reject a challenge submission with feedback',
  })
  async rejectSubmission(
    @Param('submissionId') submissionId: string,
    @Body() dto: RejectSubmissionDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.rejectSubmission(submissionId, dto, req.user.id);
    return {
      success: true,
      message: 'Submission rejected successfully',
    };
  }

  // ==================== EVENTS ====================

  @Get('events')
  @ApiOperation({
    summary: 'Get Events',
    description: 'Retrieve events with advanced filtering, search, and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Events retrieved successfully',
  })
  async getEvents(
    @Query() filters: EventFiltersDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    const result = await this.contentManagementService.getEvents(filters, req.user.id);
    return {
      success: true,
      message: 'Events retrieved successfully',
      data: result,
    };
  }

  @Get('events/:id')
  @ApiOperation({
    summary: 'Get Event by ID',
    description: 'Retrieve detailed information about a specific event',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  async getEventById(@Param('id') id: string) {
    const result = await this.contentManagementService.getEventById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Get('events/:id/attendees')
  @ApiOperation({
    summary: 'Get Event Attendees',
    description: 'Get list of attendees for an event',
  })
  async getEventAttendees(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.contentManagementService.getEventAttendees(id, pagination);
    return {
      success: true,
      data: result,
    };
  }

  @Put('events/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve Event',
    description: 'Approve an event for publication',
  })
  async approveEvent(
    @Param('id') id: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.approveEvent(id, req.user.id);
    return {
      success: true,
      message: 'Event approved successfully',
    };
  }

  @Put('events/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject Event',
    description: 'Reject an event with a reason',
  })
  async rejectEvent(
    @Param('id') id: string,
    @Body() dto: RejectContentDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.rejectEvent(id, dto, req.user.id);
    return {
      success: true,
      message: 'Event rejected successfully',
    };
  }

  @Put('events/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel Event',
    description: 'Cancel an event with a reason',
  })
  async cancelEvent(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.cancelEvent(id, reason, req.user.id);
    return {
      success: true,
      message: 'Event cancelled successfully',
    };
  }

  @Post('events/:id/message-attendees')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Message Attendees',
    description: 'Send a message to all event attendees',
  })
  async messageAttendees(
    @Param('id') id: string,
    @Body() dto: MessageAttendeesDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.messageAttendees(id, dto, req.user.id);
    return {
      success: true,
      message: 'Message sent to attendees',
    };
  }

  // ==================== POSTS ====================

  @Get('posts')
  @ApiOperation({
    summary: 'Get Posts',
    description: 'Retrieve posts with advanced filtering, search, and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Posts retrieved successfully',
  })
  async getPosts(
    @Query() filters: PostFiltersDto,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    const result = await this.contentManagementService.getPosts(filters, req.user.id);
    return {
      success: true,
      message: 'Posts retrieved successfully',
      data: result,
    };
  }

  @Get('posts/:id')
  @ApiOperation({
    summary: 'Get Post by ID',
    description: 'Retrieve detailed information about a specific post including comments',
  })
  async getPostById(@Param('id') id: string) {
    const result = await this.contentManagementService.getPostById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Put('posts/:id/moderate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Moderate Post',
    description: 'Hide, delete, or restore a post',
  })
  async moderatePost(
    @Param('id') id: string,
    @Body('action') action: 'hide' | 'delete' | 'restore',
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.moderatePost(id, action, req.user.id);
    const actionMessages = {
      hide: 'Post hidden successfully',
      delete: 'Post deleted successfully',
      restore: 'Post restored successfully',
    };
    return {
      success: true,
      message: actionMessages[action],
    };
  }

  @Put('posts/:id/feature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Feature/Unfeature Post',
    description: 'Toggle featured status for a post',
  })
  async featurePost(
    @Param('id') id: string,
    @Body('featured') featured: boolean,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.featurePost(id, featured, req.user.id);
    return {
      success: true,
      message: featured ? 'Post featured successfully' : 'Post unfeatured successfully',
    };
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete Post',
    description: 'Permanently delete a post',
  })
  async deletePost(
    @Param('id') id: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.deletePost(id, req.user.id);
    return {
      success: true,
      message: 'Post deleted successfully',
    };
  }

  @Delete('posts/:postId/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete Comment',
    description: 'Delete a comment from a post',
  })
  async deleteComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() req: ExpressRequest & AdminRequest,
  ) {
    await this.contentManagementService.deleteComment(postId, commentId, req.user.id);
    return {
      success: true,
      message: 'Comment deleted successfully',
    };
  }
}
