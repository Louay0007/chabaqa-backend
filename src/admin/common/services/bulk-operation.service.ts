import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  BulkOperationDto,
  BulkOperationStatus,
  BulkOperationProgressDto,
  BulkOperationResultDto,
} from '../dto/bulk-operation.dto';
import { BulkOperationResult } from '../interfaces/admin-interfaces';

/**
 * Interface for bulk operation handler
 */
export interface BulkOperationHandler<T = any> {
  execute(itemId: string, context: BulkOperationContext): Promise<T>;
  validate?(itemId: string, context: BulkOperationContext): Promise<boolean>;
}

/**
 * Context for bulk operations
 */
export interface BulkOperationContext {
  adminUserId: Types.ObjectId;
  action: string;
  reason?: string;
  metadata?: Record<string, any>;
  updateData?: Record<string, any>;
}

/**
 * Bulk operation progress tracker
 */
interface BulkOperationProgress {
  operationId: string;
  status: BulkOperationStatus;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  startedAt: Date;
  completedAt?: Date;
  failures: Array<{
    itemId: string;
    error: string;
    code?: string;
  }>;
  estimatedTimeRemaining?: number;
}

/**
 * Service for managing bulk operations with progress tracking
 */
@Injectable()
export class BulkOperationService {
  private operations: Map<string, BulkOperationProgress> = new Map();
  private readonly PROGRESS_UPDATE_INTERVAL = 100; // Update progress every 100 items
  private readonly OPERATION_TIMEOUT = 3600000; // 1 hour timeout

  /**
   * Execute a bulk operation with progress tracking
   */
  async executeBulkOperation<T = any>(
    dto: BulkOperationDto,
    handler: BulkOperationHandler<T>,
    context: BulkOperationContext
  ): Promise<BulkOperationResultDto> {
    // Validate input
    if (!dto.ids || dto.ids.length === 0) {
      throw new BadRequestException('No items provided for bulk operation');
    }

    if (dto.ids.length > 1000) {
      throw new BadRequestException('Bulk operation limited to 1000 items at a time');
    }

    // Generate operation ID
    const operationId = this.generateOperationId();

    // Initialize progress tracking
    const progress: BulkOperationProgress = {
      operationId,
      status: BulkOperationStatus.IN_PROGRESS,
      totalItems: dto.ids.length,
      processedItems: 0,
      successCount: 0,
      failureCount: 0,
      startedAt: new Date(),
      failures: [],
    };

    this.operations.set(operationId, progress);

    // Execute operation
    const startTime = Date.now();
    const results: T[] = [];

    try {
      // Process items in batches
      const batchSize = 10;
      for (let i = 0; i < dto.ids.length; i += batchSize) {
        const batch = dto.ids.slice(i, i + batchSize);

        // Process batch items in parallel
        const batchPromises = batch.map(async (itemId) => {
          try {
            // Validate if handler provides validation
            if (handler.validate) {
              const isValid = await handler.validate(itemId, context);
              if (!isValid) {
                throw new Error('Validation failed');
              }
            }

            // Execute operation
            const result = await handler.execute(itemId, context);
            progress.successCount++;
            return { success: true, itemId, result };
          } catch (error) {
            progress.failureCount++;
            progress.failures.push({
              itemId,
              error: error.message || 'Unknown error',
              code: error.code || 'OPERATION_FAILED',
            });
            return { success: false, itemId, error };
          } finally {
            progress.processedItems++;
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter((r) => r.success && r.result !== undefined).map((r) => r.result!));

        // Update progress
        this.updateProgress(progress);

        // Check for timeout
        if (Date.now() - startTime > this.OPERATION_TIMEOUT) {
          throw new Error('Bulk operation timeout exceeded');
        }
      }

      // Mark operation as completed
      progress.status =
        progress.failureCount === 0
          ? BulkOperationStatus.COMPLETED
          : progress.failureCount === progress.totalItems
          ? BulkOperationStatus.FAILED
          : BulkOperationStatus.PARTIALLY_COMPLETED;

      progress.completedAt = new Date();

      // Build result
      const duration = Date.now() - startTime;
      const result: BulkOperationResultDto = {
        operationId,
        success: progress.failureCount === 0,
        message: this.buildResultMessage(progress),
        totalItems: progress.totalItems,
        successCount: progress.successCount,
        failureCount: progress.failureCount,
        failures: progress.failures,
        duration,
        data: results,
      };

      // Clean up operation after some time
      setTimeout(() => this.operations.delete(operationId), 300000); // 5 minutes

      return result;
    } catch (error) {
      progress.status = BulkOperationStatus.FAILED;
      progress.completedAt = new Date();

      throw new BadRequestException(
        `Bulk operation failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Get progress of a bulk operation
   */
  getOperationProgress(operationId: string): BulkOperationProgressDto {
    const progress = this.operations.get(operationId);

    if (!progress) {
      throw new NotFoundException(`Bulk operation ${operationId} not found`);
    }

    const progressPercentage =
      progress.totalItems > 0
        ? Math.round((progress.processedItems / progress.totalItems) * 100)
        : 0;

    return {
      operationId: progress.operationId,
      status: progress.status,
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      successCount: progress.successCount,
      failureCount: progress.failureCount,
      progressPercentage,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
      estimatedTimeRemaining: this.calculateEstimatedTime(progress),
      failures: progress.failures.slice(0, 100), // Limit failures in response
    };
  }

  /**
   * Cancel a bulk operation
   */
  cancelOperation(operationId: string): void {
    const progress = this.operations.get(operationId);

    if (!progress) {
      throw new NotFoundException(`Bulk operation ${operationId} not found`);
    }

    if (progress.status === BulkOperationStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed operation');
    }

    progress.status = BulkOperationStatus.CANCELLED;
    progress.completedAt = new Date();
  }

  /**
   * Execute bulk operation with simple result
   */
  async executeBulkOperationSimple(
    itemIds: string[],
    handler: (itemId: string) => Promise<void>,
    context: { adminUserId: Types.ObjectId; action: string }
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      totalItems: itemIds.length,
      successCount: 0,
      failureCount: 0,
      failures: [],
      summary: '',
    };

    for (const itemId of itemIds) {
      try {
        await handler(itemId);
        result.successCount++;
      } catch (error) {
        result.failureCount++;
        result.failures.push({
          itemId,
          error: error.message || 'Unknown error',
          code: error.code || 'OPERATION_FAILED',
        });
      }
    }

    result.summary = this.buildSimpleResultMessage(result);

    return result;
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Update progress with estimated time
   */
  private updateProgress(progress: BulkOperationProgress): void {
    progress.estimatedTimeRemaining = this.calculateEstimatedTime(progress);
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTime(progress: BulkOperationProgress): number | undefined {
    if (progress.processedItems === 0) {
      return undefined;
    }

    const elapsedTime = Date.now() - progress.startedAt.getTime();
    const averageTimePerItem = elapsedTime / progress.processedItems;
    const remainingItems = progress.totalItems - progress.processedItems;

    return Math.round((remainingItems * averageTimePerItem) / 1000); // Return in seconds
  }

  /**
   * Build result message
   */
  private buildResultMessage(progress: BulkOperationProgress): string {
    if (progress.failureCount === 0) {
      return `Successfully processed all ${progress.totalItems} items`;
    }

    if (progress.successCount === 0) {
      return `Failed to process all ${progress.totalItems} items`;
    }

    return `Processed ${progress.totalItems} items: ${progress.successCount} succeeded, ${progress.failureCount} failed`;
  }

  /**
   * Build simple result message
   */
  private buildSimpleResultMessage(result: BulkOperationResult): string {
    if (result.failureCount === 0) {
      return `Successfully processed all ${result.totalItems} items`;
    }

    if (result.successCount === 0) {
      return `Failed to process all ${result.totalItems} items`;
    }

    return `Processed ${result.totalItems} items: ${result.successCount} succeeded, ${result.failureCount} failed`;
  }

  /**
   * Get all active operations
   */
  getActiveOperations(): BulkOperationProgressDto[] {
    const activeOps: BulkOperationProgressDto[] = [];

    this.operations.forEach((progress) => {
      if (
        progress.status === BulkOperationStatus.IN_PROGRESS ||
        progress.status === BulkOperationStatus.PENDING
      ) {
        const progressPercentage =
          progress.totalItems > 0
            ? Math.round((progress.processedItems / progress.totalItems) * 100)
            : 0;

        activeOps.push({
          operationId: progress.operationId,
          status: progress.status,
          totalItems: progress.totalItems,
          processedItems: progress.processedItems,
          successCount: progress.successCount,
          failureCount: progress.failureCount,
          progressPercentage,
          startedAt: progress.startedAt,
          completedAt: progress.completedAt,
          estimatedTimeRemaining: this.calculateEstimatedTime(progress),
        });
      }
    });

    return activeOps;
  }

  /**
   * Clean up old completed operations
   */
  cleanupOldOperations(maxAgeMs: number = 3600000): void {
    const now = Date.now();

    this.operations.forEach((progress, operationId) => {
      if (
        progress.completedAt &&
        now - progress.completedAt.getTime() > maxAgeMs
      ) {
        this.operations.delete(operationId);
      }
    });
  }
}
