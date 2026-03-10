import { Injectable, BadRequestException } from '@nestjs/common';
import { Model, Document } from 'mongoose';
import { PaginatedFilterDto } from '../dto/advanced-filter.dto';
import { FilterBuilder } from '../utils/filter-builder.util';
import { PaginatedResult } from '../interfaces/admin-interfaces';

/**
 * Service for managing data filtering, sorting, and pagination
 */
@Injectable()
export class DataManagementService {
  /**
   * Apply advanced filtering, sorting, and pagination to a MongoDB model
   */
  async findWithFilters<T extends Document>(
    model: Model<T>,
    filterDto: PaginatedFilterDto,
    options?: {
      allowedFields?: string[];
      defaultSort?: { field: string; order: 'asc' | 'desc' };
      populate?: string | string[];
      select?: string;
    }
  ): Promise<PaginatedResult<T>> {
    // Validate fields if allowed fields are specified
    if (options?.allowedFields && filterDto.filters) {
      const validation = FilterBuilder.validateFields(
        filterDto.filters,
        options.allowedFields
      );

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid filter fields: ${validation.invalidFields.join(', ')}`
        );
      }
    }

    // Build MongoDB query
    const query = FilterBuilder.buildCompleteQuery({
      filters: filterDto.filters,
      search: filterDto.search,
      searchFields: filterDto.searchFields,
      dateRanges: filterDto.dateRanges,
      numberRanges: filterDto.numberRanges,
    });

    // Build sort configuration
    const sort = FilterBuilder.buildSort(filterDto.sort);

    // Apply default sort if no sort specified
    if (Object.keys(sort).length === 0 && options?.defaultSort) {
      sort[options.defaultSort.field] = options.defaultSort.order === 'asc' ? 1 : -1;
    }

    // Calculate pagination
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const skip = (page - 1) * limit;

    // Execute query with pagination
    const queryBuilder = model.find(query).sort(sort).skip(skip).limit(limit);

    // Apply population if specified
    if (options?.populate) {
      if (Array.isArray(options.populate)) {
        options.populate.forEach((path) => {
          queryBuilder.populate(path);
        });
      } else {
        queryBuilder.populate(options.populate);
      }
    }

    // Apply field selection if specified
    if (options?.select) {
      queryBuilder.select(options.select);
    }

    // Execute query and count
    const [data, total] = await Promise.all([
      queryBuilder.exec(),
      model.countDocuments(query).exec(),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
    };
  }

  /**
   * Apply filtering without pagination (for exports or bulk operations)
   */
  async findAllWithFilters<T extends Document>(
    model: Model<T>,
    filterDto: {
      filters?: any;
      search?: string;
      searchFields?: string[];
      dateRanges?: any;
      numberRanges?: any;
      sort?: any;
    },
    options?: {
      allowedFields?: string[];
      populate?: string | string[];
      select?: string;
      limit?: number;
    }
  ): Promise<T[]> {
    // Validate fields if allowed fields are specified
    if (options?.allowedFields && filterDto.filters) {
      const validation = FilterBuilder.validateFields(
        filterDto.filters,
        options.allowedFields
      );

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid filter fields: ${validation.invalidFields.join(', ')}`
        );
      }
    }

    // Build MongoDB query
    const query = FilterBuilder.buildCompleteQuery(filterDto);

    // Build sort configuration
    const sort = FilterBuilder.buildSort(filterDto.sort);

    // Execute query
    const queryBuilder = model.find(query).sort(sort);

    // Apply limit if specified
    if (options?.limit) {
      queryBuilder.limit(options.limit);
    }

    // Apply population if specified
    if (options?.populate) {
      if (Array.isArray(options.populate)) {
        options.populate.forEach((path) => {
          queryBuilder.populate(path);
        });
      } else {
        queryBuilder.populate(options.populate);
      }
    }

    // Apply field selection if specified
    if (options?.select) {
      queryBuilder.select(options.select);
    }

    return queryBuilder.exec();
  }

  /**
   * Count documents matching filters
   */
  async countWithFilters<T extends Document>(
    model: Model<T>,
    filterDto: {
      filters?: any;
      search?: string;
      searchFields?: string[];
      dateRanges?: any;
      numberRanges?: any;
    },
    options?: {
      allowedFields?: string[];
    }
  ): Promise<number> {
    // Validate fields if allowed fields are specified
    if (options?.allowedFields && filterDto.filters) {
      const validation = FilterBuilder.validateFields(
        filterDto.filters,
        options.allowedFields
      );

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid filter fields: ${validation.invalidFields.join(', ')}`
        );
      }
    }

    // Build MongoDB query
    const query = FilterBuilder.buildCompleteQuery(filterDto);

    return model.countDocuments(query).exec();
  }

  /**
   * Get distinct values for a field with filters
   */
  async getDistinctValues<T extends Document>(
    model: Model<T>,
    field: string,
    filterDto: {
      filters?: any;
      search?: string;
      searchFields?: string[];
      dateRanges?: any;
      numberRanges?: any;
    },
    options?: {
      allowedFields?: string[];
    }
  ): Promise<any[]> {
    // Validate fields if allowed fields are specified
    if (options?.allowedFields && filterDto.filters) {
      const validation = FilterBuilder.validateFields(
        filterDto.filters,
        options.allowedFields
      );

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid filter fields: ${validation.invalidFields.join(', ')}`
        );
      }
    }

    // Build MongoDB query
    const query = FilterBuilder.buildCompleteQuery(filterDto);

    return model.distinct(field, query).exec();
  }

  /**
   * Aggregate data with filters
   */
  async aggregateWithFilters<T extends Document>(
    model: Model<T>,
    filterDto: {
      filters?: any;
      search?: string;
      searchFields?: string[];
      dateRanges?: any;
      numberRanges?: any;
    },
    pipeline: any[],
    options?: {
      allowedFields?: string[];
    }
  ): Promise<any[]> {
    // Validate fields if allowed fields are specified
    if (options?.allowedFields && filterDto.filters) {
      const validation = FilterBuilder.validateFields(
        filterDto.filters,
        options.allowedFields
      );

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid filter fields: ${validation.invalidFields.join(', ')}`
        );
      }
    }

    // Build MongoDB query
    const query = FilterBuilder.buildCompleteQuery(filterDto);

    // Prepend match stage to pipeline
    const fullPipeline = [{ $match: query }, ...pipeline];

    return model.aggregate(fullPipeline).exec();
  }
}
