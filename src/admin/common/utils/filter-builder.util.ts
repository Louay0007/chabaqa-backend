import { FilterGroup, FilterCondition, FilterOperator, LogicalOperator, DateRangeFilter, NumberRangeFilter } from '../dto/advanced-filter.dto';

/**
 * Utility class for building MongoDB queries from filter DTOs
 */
export class FilterBuilder {
  /**
   * Build MongoDB query from filter group
   */
  static buildQuery(filterGroup?: FilterGroup): any {
    if (!filterGroup) {
      return {};
    }

    const query: any = {};
    const conditions: any[] = [];

    // Process filter conditions
    if (filterGroup.conditions && filterGroup.conditions.length > 0) {
      filterGroup.conditions.forEach((condition) => {
        const conditionQuery = this.buildConditionQuery(condition);
        if (conditionQuery) {
          conditions.push(conditionQuery);
        }
      });
    }

    // Process nested filter groups
    if (filterGroup.groups && filterGroup.groups.length > 0) {
      filterGroup.groups.forEach((group) => {
        const groupQuery = this.buildQuery(group);
        if (Object.keys(groupQuery).length > 0) {
          conditions.push(groupQuery);
        }
      });
    }

    // Combine conditions based on logical operator
    if (conditions.length === 0) {
      return {};
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    const operator = filterGroup.operator || LogicalOperator.AND;
    switch (operator) {
      case LogicalOperator.AND:
        query.$and = conditions;
        break;
      case LogicalOperator.OR:
        query.$or = conditions;
        break;
      case LogicalOperator.NOT:
        query.$nor = conditions;
        break;
      default:
        query.$and = conditions;
    }

    return query;
  }

  /**
   * Build MongoDB query for a single filter condition
   */
  private static buildConditionQuery(condition: FilterCondition): any {
    const { field, operator, value } = condition;

    if (!field || operator === undefined) {
      return null;
    }

    const query: any = {};

    switch (operator) {
      case FilterOperator.EQUALS:
        query[field] = value;
        break;

      case FilterOperator.NOT_EQUALS:
        query[field] = { $ne: value };
        break;

      case FilterOperator.GREATER_THAN:
        query[field] = { $gt: value };
        break;

      case FilterOperator.GREATER_THAN_OR_EQUAL:
        query[field] = { $gte: value };
        break;

      case FilterOperator.LESS_THAN:
        query[field] = { $lt: value };
        break;

      case FilterOperator.LESS_THAN_OR_EQUAL:
        query[field] = { $lte: value };
        break;

      case FilterOperator.IN:
        query[field] = { $in: Array.isArray(value) ? value : [value] };
        break;

      case FilterOperator.NOT_IN:
        query[field] = { $nin: Array.isArray(value) ? value : [value] };
        break;

      case FilterOperator.CONTAINS:
        query[field] = { $regex: this.escapeRegex(value), $options: 'i' };
        break;

      case FilterOperator.STARTS_WITH:
        query[field] = { $regex: `^${this.escapeRegex(value)}`, $options: 'i' };
        break;

      case FilterOperator.ENDS_WITH:
        query[field] = { $regex: `${this.escapeRegex(value)}$`, $options: 'i' };
        break;

      case FilterOperator.REGEX:
        query[field] = { $regex: value, $options: 'i' };
        break;

      case FilterOperator.EXISTS:
        query[field] = { $exists: Boolean(value) };
        break;

      case FilterOperator.BETWEEN:
        if (Array.isArray(value) && value.length === 2) {
          query[field] = { $gte: value[0], $lte: value[1] };
        }
        break;

      default:
        return null;
    }

    return query;
  }

  /**
   * Build date range query
   */
  static buildDateRangeQuery(dateRanges?: Record<string, DateRangeFilter>): any {
    if (!dateRanges || Object.keys(dateRanges).length === 0) {
      return {};
    }

    const query: any = {};

    Object.entries(dateRanges).forEach(([field, range]) => {
      const dateQuery: any = {};

      if (range.startDate) {
        dateQuery.$gte = new Date(range.startDate);
      }

      if (range.endDate) {
        dateQuery.$lte = new Date(range.endDate);
      }

      if (Object.keys(dateQuery).length > 0) {
        query[field] = dateQuery;
      }
    });

    return query;
  }

  /**
   * Build number range query
   */
  static buildNumberRangeQuery(numberRanges?: Record<string, NumberRangeFilter>): any {
    if (!numberRanges || Object.keys(numberRanges).length === 0) {
      return {};
    }

    const query: any = {};

    Object.entries(numberRanges).forEach(([field, range]) => {
      const numberQuery: any = {};

      if (range.min !== undefined) {
        numberQuery.$gte = range.min;
      }

      if (range.max !== undefined) {
        numberQuery.$lte = range.max;
      }

      if (Object.keys(numberQuery).length > 0) {
        query[field] = numberQuery;
      }
    });

    return query;
  }

  /**
   * Build full-text search query
   */
  static buildSearchQuery(searchTerm?: string, searchFields?: string[]): any {
    if (!searchTerm || !searchFields || searchFields.length === 0) {
      return {};
    }

    const escapedTerm = this.escapeRegex(searchTerm);
    const searchConditions = searchFields.map((field) => ({
      [field]: { $regex: escapedTerm, $options: 'i' },
    }));

    return searchConditions.length > 0 ? { $or: searchConditions } : {};
  }

  /**
   * Build sort object from sort configuration
   */
  static buildSort(sortConfig?: { sorts?: Array<{ field: string; order?: 'asc' | 'desc' }> }): any {
    if (!sortConfig || !sortConfig.sorts || sortConfig.sorts.length === 0) {
      return {};
    }

    const sort: any = {};

    sortConfig.sorts.forEach((sortItem) => {
      if (sortItem.field) {
        sort[sortItem.field] = sortItem.order === 'asc' ? 1 : -1;
      }
    });

    return sort;
  }

  /**
   * Combine multiple query parts into a single MongoDB query
   */
  static combineQueries(...queries: any[]): any {
    const validQueries = queries.filter(
      (q) => q && typeof q === 'object' && Object.keys(q).length > 0
    );

    if (validQueries.length === 0) {
      return {};
    }

    if (validQueries.length === 1) {
      return validQueries[0];
    }

    return { $and: validQueries };
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(str: string): string {
    if (typeof str !== 'string') {
      return String(str);
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate field names against allowed fields
   */
  static validateFields(
    filterGroup: FilterGroup | undefined,
    allowedFields: string[]
  ): { valid: boolean; invalidFields: string[] } {
    const invalidFields: string[] = [];

    if (!filterGroup) {
      return { valid: true, invalidFields: [] };
    }

    const checkConditions = (conditions: FilterCondition[]) => {
      conditions.forEach((condition) => {
        if (condition.field && !allowedFields.includes(condition.field)) {
          invalidFields.push(condition.field);
        }
      });
    };

    const checkGroup = (group: FilterGroup) => {
      if (group.conditions) {
        checkConditions(group.conditions);
      }

      if (group.groups) {
        group.groups.forEach(checkGroup);
      }
    };

    checkGroup(filterGroup);

    return {
      valid: invalidFields.length === 0,
      invalidFields: [...new Set(invalidFields)],
    };
  }

  /**
   * Build complete query from advanced filter DTO
   */
  static buildCompleteQuery(filterDto: {
    filters?: FilterGroup;
    search?: string;
    searchFields?: string[];
    dateRanges?: Record<string, DateRangeFilter>;
    numberRanges?: Record<string, NumberRangeFilter>;
  }): any {
    const queries: any[] = [];

    // Build filter group query
    if (filterDto.filters) {
      const filterQuery = this.buildQuery(filterDto.filters);
      if (Object.keys(filterQuery).length > 0) {
        queries.push(filterQuery);
      }
    }

    // Build search query
    if (filterDto.search && filterDto.searchFields) {
      const searchQuery = this.buildSearchQuery(filterDto.search, filterDto.searchFields);
      if (Object.keys(searchQuery).length > 0) {
        queries.push(searchQuery);
      }
    }

    // Build date range query
    if (filterDto.dateRanges) {
      const dateQuery = this.buildDateRangeQuery(filterDto.dateRanges);
      if (Object.keys(dateQuery).length > 0) {
        queries.push(dateQuery);
      }
    }

    // Build number range query
    if (filterDto.numberRanges) {
      const numberQuery = this.buildNumberRangeQuery(filterDto.numberRanges);
      if (Object.keys(numberQuery).length > 0) {
        queries.push(numberQuery);
      }
    }

    return this.combineQueries(...queries);
  }
}
