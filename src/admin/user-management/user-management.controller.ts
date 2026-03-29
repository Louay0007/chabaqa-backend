import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';

// Import services
import { UserManagementService, UserDetails, UserAnalytics } from './user-management.service';

// Import DTOs
import { UserFiltersDto } from './dto/user-filters.dto';
import { SuspendUserDto, ActivateUserDto, ResetUserPasswordDto, UpdateAdminNotesDto } from './dto/user-actions.dto';
import { CreateUserDto } from '../../dto-user/create-user.dto';
import { UpdateUserDto } from '../../dto-user/update-user.dto';

// Import guards and decorators
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminPermissions } from '../common/decorators/admin-roles.decorator';
import { AuditContext } from '../common/decorators/audit-context.decorator';

// Import interfaces and enums
import { AdminPermission } from '../schemas/admin-user.schema';
import { AdminAction } from '../schemas/audit-log.schema';
import { PaginatedResult, TimePeriod } from '../common/interfaces/admin-interfaces';
import { UserDocument } from '../../schema/user.schema';

/**
 * User Management Controller for Admin System
 * Provides comprehensive user administration endpoints
 */
@ApiTags('Admin - User Management')
@Controller('admin/users')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@ApiBearerAuth()
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  /**
   * Get users with filtering and pagination
   * Requirement 1.1, 1.2
   */
  @Get()
  @RequireAdminPermissions(AdminPermission.USER_READ)
  @AuditContext({ action: AdminAction.USER_LIST, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Get users with filtering and pagination',
    description: 'Retrieve paginated list of users with advanced filtering options including status, role, registration date, and search functionality'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Users retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Users retrieved successfully' },
        data: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            total: { type: 'number', example: 150 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
            totalPages: { type: 'number', example: 8 }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUsers(@Query() filters: UserFiltersDto): Promise<{
    success: boolean;
    message: string;
    data: PaginatedResult<UserDocument>;
  }> {
    try {
      const result = await this.userManagementService.getUsers(filters);
      return {
        success: true,
        message: 'Users retrieved successfully',
        data: result
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve users',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get detailed user information
   * Requirement 1.3
   */
  @Get(':id')
  @RequireAdminPermissions(AdminPermission.USER_READ)
  @AuditContext({ action: AdminAction.USER_VIEW, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Get detailed user information',
    description: 'Retrieve comprehensive user details including profile, activity history, subscription status, and community memberships'
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'User details retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User details retrieved successfully' },
        data: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUserDetails(@Param('id') userId: string): Promise<{
    success: boolean;
    message: string;
    data: UserDetails;
  }> {
    try {
      const userDetails = await this.userManagementService.getUserDetails(userId);
      return {
        success: true,
        message: 'User details retrieved successfully',
        data: userDetails
      };
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      console.error('Error in getUserDetails:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve user details',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Create a new user
   */
  @Post()
  @RequireAdminPermissions(AdminPermission.USER_CREATE)
  @AuditContext({ action: AdminAction.USER_CREATE, entityType: 'User' })
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async createUser(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    const user = await this.userManagementService.createUser(createUserDto, req.user.id);
    return {
      success: true,
      message: 'User created successfully',
      data: user
    };
  }

  /**
   * Update a user
   */
  @Put(':id')
  @RequireAdminPermissions(AdminPermission.USER_UPDATE)
  @AuditContext({ action: AdminAction.USER_UPDATE, entityType: 'User' })
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUser(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any
  ) {
    const user = await this.userManagementService.updateUser(userId, updateUserDto, req.user.id);
    return {
      success: true,
      message: 'User updated successfully',
      data: user
    };
  }

  /**
   * Delete a user (Hard Delete)
   */
  @Delete(':id')
  @RequireAdminPermissions(AdminPermission.USER_DELETE)
  @AuditContext({ action: AdminAction.USER_DELETE, entityType: 'User' })
  @ApiOperation({ summary: 'Delete a user permanently' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(@Param('id') userId: string, @Request() req: any) {
    await this.userManagementService.deleteUser(userId, req.user.id);
    return {
      success: true,
      message: 'User deleted successfully'
    };
  }

  /**
   * Suspend a user account
   * Requirement 1.4
   */
  @Put(':id/suspend')
  @RequireAdminPermissions(AdminPermission.USER_SUSPEND)
  @AuditContext({ action: AdminAction.USER_SUSPEND, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Suspend a user account',
    description: 'Suspend a user account with reason and optional end date. Sends notification email to user.'
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'User suspended successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User suspended successfully' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'User already suspended or invalid data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async suspendUser(
    @Param('id') userId: string,
    @Body() suspendData: SuspendUserDto,
    @Request() req: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userManagementService.suspendUser(userId, suspendData, req.user.id);
      return {
        success: true,
        message: 'User suspended successfully'
      };
    } catch (error) {
      if (error.status === 404 || error.status === 400) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to suspend user',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Activate a suspended user account
   * Requirement 1.5
   */
  @Put(':id/activate')
  @RequireAdminPermissions(AdminPermission.USER_ACTIVATE)
  @AuditContext({ action: AdminAction.USER_ACTIVATE, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Activate a suspended user account',
    description: 'Reactivate a suspended user account. Sends notification email to user.'
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'User activated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User activated successfully' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'User is not suspended' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async activateUser(
    @Param('id') userId: string,
    @Body() activateData: ActivateUserDto,
    @Request() req: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userManagementService.activateUser(userId, activateData, req.user.id);
      return {
        success: true,
        message: 'User activated successfully'
      };
    } catch (error) {
      console.error('Error activating user:', error);
      if (error.status === 404 || error.status === 400) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to activate user',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Reset user password
   * Requirement 1.6
   */
  @Post(':id/reset-password')
  @RequireAdminPermissions(AdminPermission.USER_PASSWORD_RESET)
  @AuditContext({ action: AdminAction.USER_PASSWORD_RESET, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Reset user password',
    description: 'Generate a new temporary password for the user. Optionally sends reset instructions via email.'
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Password reset successfully' },
        data: {
          type: 'object',
          properties: {
            temporaryPassword: { type: 'string', description: 'Only returned if email sending failed' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async resetUserPassword(
    @Param('id') userId: string,
    @Body() resetData: ResetUserPasswordDto,
    @Request() req: any
  ): Promise<{
    success: boolean;
    message: string;
    data?: { temporaryPassword?: string };
  }> {
    try {
      const result = await this.userManagementService.resetUserPassword(userId, resetData, req.user.id);
      return {
        success: true,
        message: 'Password reset successfully',
        data: result
      };
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to reset password',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Update admin notes for a user
   */
  @Put(':id/notes')
  @RequireAdminPermissions(AdminPermission.USER_UPDATE)
  @AuditContext({ action: AdminAction.USER_UPDATE, entityType: 'User' })
  @ApiOperation({ 
    summary: 'Update admin notes for a user',
    description: 'Add or update administrative notes for a user account'
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Admin notes updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Admin notes updated successfully' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateAdminNotes(
    @Param('id') userId: string,
    @Body() notesData: UpdateAdminNotesDto,
    @Request() req: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.userManagementService.updateAdminNotes(userId, notesData, req.user.id);
      return {
        success: true,
        message: 'Admin notes updated successfully'
      };
    } catch (error) {
      if (error.status === 404) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Failed to update admin notes',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get user analytics
   * Requirement 1.7
   */
  @Get('analytics/overview')
  @RequireAdminPermissions(AdminPermission.ANALYTICS_READ)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Analytics' })
  @ApiOperation({ 
    summary: 'Get user analytics',
    description: 'Retrieve comprehensive user analytics including growth metrics, engagement statistics, and retention data'
  })
  @ApiQuery({ 
    name: 'period', 
    enum: TimePeriod, 
    required: false, 
    description: 'Time period for analytics' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User analytics retrieved successfully' },
        data: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUserAnalytics(@Query('period') period?: string): Promise<{
    success: boolean;
    message: string;
    data: UserAnalytics;
  }> {
    try {
      const analytics = await this.userManagementService.getUserAnalytics(period as TimePeriod | undefined);
      return {
        success: true,
        message: 'User analytics retrieved successfully',
        data: analytics
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve user analytics',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get detailed user growth metrics
   */
  @Get('analytics/growth')
  @RequireAdminPermissions(AdminPermission.ANALYTICS_READ)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Analytics' })
  @ApiOperation({ 
    summary: 'Get detailed user growth metrics',
    description: 'Retrieve detailed user growth analysis with trends and daily breakdown'
  })
  @ApiQuery({ 
    name: 'period', 
    enum: TimePeriod, 
    required: false, 
    description: 'Time period for growth analysis' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User growth metrics retrieved successfully'
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUserGrowthMetrics(@Query('period') period?: string): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const growthMetrics = await this.userManagementService.getUserGrowthMetrics(period as TimePeriod | undefined);
      return {
        success: true,
        message: 'User growth metrics retrieved successfully',
        data: growthMetrics
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve user growth metrics',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get user retention analysis
   */
  @Get('analytics/retention')
  @RequireAdminPermissions(AdminPermission.ANALYTICS_READ)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Analytics' })
  @ApiOperation({ 
    summary: 'Get user retention analysis',
    description: 'Retrieve user retention rates, cohort analysis, and churn metrics'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User retention analysis retrieved successfully'
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUserRetentionAnalysis(): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const retentionAnalysis = await this.userManagementService.getUserRetentionAnalysis();
      return {
        success: true,
        message: 'User retention analysis retrieved successfully',
        data: retentionAnalysis
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve user retention analysis',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get user lifetime value analysis
   */
  @Get('analytics/lifetime-value')
  @RequireAdminPermissions(AdminPermission.ANALYTICS_READ)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Analytics' })
  @ApiOperation({ 
    summary: 'Get user lifetime value analysis',
    description: 'Retrieve user lifetime value metrics and distribution analysis'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User lifetime value analysis retrieved successfully'
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getUserLifetimeValueAnalysis(): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const lifetimeValueAnalysis = await this.userManagementService.getUserLifetimeValueAnalysis();
      return {
        success: true,
        message: 'User lifetime value analysis retrieved successfully',
        data: lifetimeValueAnalysis
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve user lifetime value analysis',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}