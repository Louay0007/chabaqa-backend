import { Module } from '@nestjs/common';
import { DataManagementService } from './services/data-management.service';
import { BulkOperationService } from './services/bulk-operation.service';
import { ValidationService } from './services/validation.service';
import { DataManagementController } from './controllers/data-management.controller';

/**
 * Module for data management services
 * Provides filtering, sorting, bulk operations, and validation
 */
@Module({
  controllers: [DataManagementController],
  providers: [DataManagementService, BulkOperationService, ValidationService],
  exports: [DataManagementService, BulkOperationService, ValidationService],
})
export class DataManagementModule {}
